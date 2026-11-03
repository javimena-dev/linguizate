<?php

namespace Tests\Feature;

use App\Mail\SmtpProbe;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class MailTestControllerTest extends TestCase
{
    public function test_local_smtp_probe_builds_a_message_for_the_requested_recipient(): void
    {
        Mail::fake();

        $this->postJson('/pruebas-autenticacion/correo', [
            'email' => 'destinatario@example.com',
        ])->assertOk()
            ->assertJsonPath('message', 'Laravel entregó el mensaje al servidor SMTP. Revisa la bandeja de entrada y spam del destinatario.');

        Mail::assertSent(SmtpProbe::class, function (SmtpProbe $mail): bool {
            return $mail->hasTo('destinatario@example.com')
                && $mail->envelope()->subject === 'Prueba SMTP de Lingüízate';
        });
    }
}
