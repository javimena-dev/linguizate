<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_student_registration_requires_email_verification_before_chat(): void
    {
        $token = 'test-csrf-token';
        $response = $this->withSession(['_token' => $token])
            ->withHeader('X-CSRF-TOKEN', $token)
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
}
