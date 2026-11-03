<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Question;
use App\Models\Subcategory;
use App\Models\User;
use App\Notifications\TeacherInvitationNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Laravel\Socialite\Contracts\Provider;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as SocialiteUser;
use Mockery;
use Tests\TestCase;

class ApiParityTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_catalog_and_ranking_keep_api_contract(): void
    {
        $this->seedCatalog();
        User::factory()->create(['role' => 'admin', 'score' => 999]);
        User::factory()->create(['role' => 'estudiante', 'score' => 100]);

        $this->getJson('/api/catalog')->assertOk()->assertJsonCount(1, 'categories')->assertJsonPath('categories.0.subcategories.0.questionCount', 1);
        $this->getJson('/api/subcategories/sub/questions')->assertOk()->assertJsonPath('questions.0.correct', 1);
        $ranking = $this->getJson('/api/ranking')->assertOk()->assertJsonCount(1, 'users');
        $ranking->assertJsonMissingPath('users.0.email')->assertJsonPath('users.0.role', 'estudiante');
    }

    public function test_roles_ownership_game_scoring_and_idempotency(): void
    {
        $this->seedCatalog();
        $student = User::factory()->create(['role' => 'estudiante']);
        $professor = User::factory()->create(['role' => 'profesor']);
        $headers = ['Origin' => 'http://localhost:8000', 'Referer' => 'http://localhost:8000/'];

        $this->actingAs($professor)->withHeaders($headers)->postJson('/api/classes/join', ['accessCode' => 'ABC123'])->assertForbidden();
        $payload = ['clientGameId' => 'game-1', 'categoryId' => 'cat', 'subcategoryId' => 'sub', 'mode' => 'estudio',
            'attempts' => [['questionId' => 'sub:q1', 'selectedOriginalIndex' => 1, 'responseTimeSeconds' => 5]]];
        $this->actingAs($student)->withHeaders($headers)->postJson('/api/games', $payload)->assertCreated()->assertJsonPath('game.score', 100)->assertJsonPath('game.bestStreak', 1);
        $this->actingAs($student)->withHeaders($headers)->postJson('/api/games', $payload)->assertOk()->assertJsonPath('duplicate', true);
        $this->assertDatabaseCount('games', 1);
        $this->assertDatabaseCount('question_attempts', 1);
    }

    public function test_professor_class_flow_matches_api_contract(): void
    {
        $professor = User::factory()->create(['role' => 'profesor']);
        $student = User::factory()->create(['role' => 'estudiante']);
        $headers = ['Origin' => 'http://localhost:8000', 'Referer' => 'http://localhost:8000/profesor'];

        $category = $this->actingAs($professor)->withHeaders($headers)->postJson('/api/professor/categories', [
            'name' => 'Clase de prueba',
            'description' => 'Contenido docente',
        ])->assertCreated()->assertJsonPath('category.private', true)->json('category');

        $question = $this->actingAs($professor)->withHeaders($headers)->postJson('/api/professor/categories/'.$category['id'].'/questions', [
            'question' => '¿Cuál es la opción correcta?',
            'options' => ['A', 'B', 'C', 'D'],
            'correct' => 1,
            'difficulty' => 'facil',
            'explanation' => 'B',
        ])->assertCreated()->json('question');

        $this->getJson('/api/subcategories/'.$category['id'].'/questions')->assertNotFound();
        $this->actingAs($student)->withHeaders($headers)->postJson('/api/classes/join', [
            'accessCode' => $category['accessCode'],
        ])->assertOk()->assertJsonPath('category.questions.0.id', $question['id']);

        $this->actingAs($professor)->withHeaders($headers)->postJson('/api/professor/categories/'.$category['id'].'/questions/import', [
            'questions' => [[
                'question' => 'Pregunta importada',
                'options' => ['a', 'b', 'c', 'd'],
                'correct' => 2,
                'difficulty' => 'medio',
                'explanation' => 'c',
            ]],
        ])->assertCreated()->assertJsonPath('created', 1);

        $this->actingAs($professor)->deleteJson('/api/professor/categories/'.$category['id'])
            ->assertStatus(405)->assertJsonPath('code', 'DELETE_DISABLED');
    }

    public function test_admin_dashboard_and_question_management_match_api_contract(): void
    {
        $this->seedCatalog();
        $admin = User::factory()->create(['role' => 'admin']);
        User::factory()->create(['role' => 'estudiante']);

        $this->actingAs($admin)->getJson('/api/admin/dashboard')
            ->assertOk()
            ->assertJsonPath('totalUsers', 1)
            ->assertJsonPath('totalQuestions', 1)
            ->assertJsonPath('totalCategories', 1);

        $created = $this->actingAs($admin)->postJson('/api/admin/questions', [
            'subcategoryId' => 'sub',
            'question' => 'Pregunta administrativa',
            'options' => ['a', 'b', 'c', 'd'],
            'correct' => 0,
            'difficulty' => 'dificil',
            'explanation' => 'a',
        ])->assertCreated()->json('question');

        $this->actingAs($admin)->patchJson('/api/admin/questions/'.$created['id'], [
            'subcategoryId' => 'sub',
            'question' => 'Pregunta actualizada',
            'options' => ['a', 'b', 'c', 'd'],
            'correct' => 3,
            'difficulty' => 'medio',
            'explanation' => 'd',
        ])->assertOk()->assertJsonPath('question.correct', 3);

        $this->actingAs($admin)->getJson('/api/admin/questions')->assertOk()->assertJsonCount(2, 'questions');
        $this->actingAs($admin)->deleteJson('/api/admin/questions/'.$created['id'])
            ->assertStatus(405)->assertJsonPath('code', 'DELETE_DISABLED');
    }

    public function test_public_registration_cannot_create_privileged_roles_and_login_checks_role(): void
    {
        $this->postJson('/api/auth/register', [
            'name' => 'Usuario privilegiado',
            'email' => 'privilegiado@example.com',
            'password' => 'contraseña-segura',
            'password_confirmation' => 'contraseña-segura',
            'role' => 'profesor',
        ])->assertUnprocessable()->assertJsonValidationErrors('role');

        $admin = User::factory()->create([
            'username' => 'admin-prueba',
            'role' => 'admin',
            'password' => Hash::make('contraseña-segura'),
        ]);
        $headers = ['Origin' => 'http://localhost:8000', 'Referer' => 'http://localhost:8000/login/'];

        $this->withHeaders($headers)->postJson('/api/auth/login', [
            'identifier' => $admin->username,
            'password' => 'contraseña-segura',
            'role' => 'estudiante',
        ])->assertForbidden()->assertJsonPath('code', 'ROLE_MISMATCH');

        $this->withHeaders($headers)->postJson('/api/auth/login', [
            'identifier' => $admin->username,
            'password' => 'contraseña-segura',
            'role' => 'admin',
        ])->assertOk()->assertJsonPath('user.isAdmin', true);
    }

    public function test_admin_invites_teacher_and_invitation_activates_credentials(): void
    {
        Notification::fake();
        $admin = User::factory()->create(['role' => 'admin']);
        $headers = ['Origin' => 'http://localhost:8000', 'Referer' => 'http://localhost:8000/administracion'];
        $this->actingAs($admin)->withHeaders($headers)->postJson('/api/admin/users', ['name' => 'Docente', 'email' => 'docente@example.com'])->assertCreated()->assertJsonPath('user.role', 'profesor');
        $teacher = User::where('email', 'docente@example.com')->firstOrFail();
        Notification::assertSentTo($teacher, TeacherInvitationNotification::class, function ($notification) use ($teacher, $headers) {
            parse_str(parse_url($notification->toMail($teacher)->actionUrl, PHP_URL_QUERY), $query);
            $this->withHeaders($headers)->postJson('/api/auth/invitations/accept', ['email' => $teacher->email, 'token' => $query['token'], 'password' => 'nueva-clave', 'password_confirmation' => 'nueva-clave'])->assertOk();

            return true;
        });
        $teacher->refresh();
        $this->assertTrue($teacher->hasVerifiedEmail());
        $this->assertTrue(Hash::check('nueva-clave', $teacher->password));
    }

    public function test_google_authentication_is_rejected_for_non_students(): void
    {
        $teacher = User::factory()->create([
            'email' => 'docente-google@example.com',
            'role' => 'profesor',
            'google_id' => null,
        ]);
        $googleUser = SocialiteUser::fake([
            'id' => 'google-teacher-id',
            'email' => $teacher->email,
            'email_verified' => true,
        ]);
        $provider = Mockery::mock(Provider::class);
        $provider->shouldReceive('user')->once()->andReturn($googleUser);
        Socialite::shouldReceive('driver')->once()->with('google')->andReturn($provider);

        $this->get('/api/auth/google/callback')
            ->assertRedirect(rtrim(config('app.frontend_url'), '/').'/login?google=student_only');

        $this->assertGuest('web');
        $this->assertNull($teacher->fresh()->google_id);
    }

    private function seedCatalog(): void
    {
        Category::create(['id' => 'cat', 'name' => 'Categoría', 'kind' => 'system']);
        Subcategory::create(['id' => 'sub', 'category_id' => 'cat', 'name' => 'Subcategoría']);
        Question::create(['id' => 'sub:q1', 'subcategory_id' => 'sub', 'question' => 'Pregunta', 'options' => ['a', 'b', 'c', 'd'], 'correct_index' => 1, 'difficulty' => 'facil']);
    }
}
