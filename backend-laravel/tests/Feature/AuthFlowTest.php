<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\ResetPasswordNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AuthFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_student_registration_requires_email_verification_before_chat(): void
    {
        $token = 'test-csrf-token';
        $response = $this->withSession(['_token' => $token])
            ->withHeaders([
                'X-CSRF-TOKEN' => $token,
                'Origin' => 'http://localhost:8000',
                'Referer' => 'http://localhost:8000/registro/',
            ])
            ->postJson('/api/auth/register', [
                'name' => 'Ana Estudiante',
                'email' => 'ana@example.com',
                'password' => 'contraseña-segura',
                'password_confirmation' => 'contraseña-segura',
                'gender' => 'otro',
            ]);

        $response->assertCreated()
            ->assertJsonPath('requiresVerification', true)
            ->assertJsonPath('user.role', 'estudiante')
            ->assertJsonPath('user.emailVerified', false);

        $this->assertDatabaseHas('users', ['email' => 'ana@example.com', 'role' => 'estudiante']);
        $this->getJson('/api/chat/usage')->assertForbidden()->assertJsonPath('code', 'EMAIL_NOT_VERIFIED');
    }

    public function test_verified_student_can_read_chat_quota(): void
    {
        $student = User::factory()->create(['role' => 'estudiante', 'email_verified_at' => now()]);

        $this->actingAs($student)
            ->getJson('/api/chat/usage')
            ->assertOk()
            ->assertJsonPath('limit', 10)
            ->assertJsonPath('remaining', 10);
    }

    public function test_authenticated_user_can_logout_and_invalidate_session(): void
    {
        $student = User::factory()->create([
            'role' => 'estudiante',
            'email_verified_at' => now(),
            'password' => Hash::make('contraseña-segura'),
        ]);
        $headers = [
            'Origin' => 'http://localhost:8000',
            'Referer' => 'http://localhost:8000/login/',
        ];

        $this->withHeaders($headers)
            ->postJson('/api/auth/login', [
                'email' => $student->email,
                'password' => 'contraseña-segura',
                'remember' => false,
            ])
            ->assertOk();

        $this->withHeaders($headers)
            ->getJson('/api/auth/session')
            ->assertOk()
            ->assertJsonPath('user.id', $student->id);

        $this->withHeaders($headers)
            ->deleteJson('/api/auth/session')
            ->assertNoContent();

        $this->assertGuest('web');
        Auth::forgetGuards();
        $this->withHeaders($headers)
            ->getJson('/api/auth/session')
            ->assertUnauthorized()
            ->assertJsonPath('message', 'Unauthenticated.');
    }

    public function test_existing_user_receives_password_reset_email(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'recuperacion@example.com']);

        $this->postJson('/api/auth/password/forgot', ['email' => 'RECUPERACION@example.com'])
            ->assertOk()
            ->assertJsonPath('message', 'Si la cuenta existe, enviamos las instrucciones al correo.');

        Notification::assertSentTo($user, ResetPasswordNotification::class);
        $this->assertDatabaseHas('password_reset_tokens', ['email' => $user->email]);
    }

    public function test_verified_student_receives_streamed_groq_response(): void
    {
        Http::fake([
            'api.groq.com/*' => Http::response(
                "data: {\"choices\":[{\"delta\":{\"content\":\"Hola\"}}]}\n\n".
                "data: {\"choices\":[{\"delta\":{\"content\":\" estudiante\"}}]}\n\n".
                "data: [DONE]\n\n",
                200,
                ['Content-Type' => 'text/event-stream']
            ),
        ]);

        $student = User::factory()->create(['role' => 'estudiante', 'email_verified_at' => now()]);

        $response = $this->actingAs($student)->postJson('/api/chat', [
            'message' => 'Hola',
            'history' => [],
        ]);

        $response->assertOk()->assertHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        $content = $response->streamedContent();
        $this->assertStringContainsString('"type":"delta","delta":"Hola"', $content);
        $this->assertStringContainsString('"type":"delta","delta":" estudiante"', $content);
        $this->assertStringContainsString('"type":"done"', $content);
        $this->assertDatabaseHas('chat_usages', ['user_id' => $student->id, 'count' => 1]);
    }

    public function test_professor_cannot_use_chat_and_groq_errors_release_quota(): void
    {
        $professor = User::factory()->create(['role' => 'profesor']);
        $this->actingAs($professor)->postJson('/api/chat', ['message' => 'Hola'])->assertForbidden();

        Http::fake(['api.groq.com/*' => Http::response(['error' => 'provider failed'], 500)]);
        $student = User::factory()->create(['role' => 'estudiante']);
        $this->actingAs($student)->postJson('/api/chat', ['message' => '¿Qué es un fonema?'])
            ->assertStatus(502)->assertJsonPath('code', 'GROQ_ERROR');
        $this->assertDatabaseHas('chat_usages', ['user_id' => $student->id, 'count' => 0]);
    }
}
