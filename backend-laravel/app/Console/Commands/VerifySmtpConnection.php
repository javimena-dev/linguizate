<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;

class VerifySmtpConnection extends Command
{
    protected $signature = 'mail:verify-smtp';

    protected $description = 'Verifica la conexión y autenticación SMTP sin enviar un correo';

    public function handle(): int
    {
        $transport = Mail::mailer()->getSymfonyTransport();

        if (! method_exists($transport, 'start')) {
            $this->error('El mailer configurado no admite una comprobación SMTP. Usa MAIL_MAILER=smtp.');

            return self::FAILURE;
        }

        try {
            $transport->start();
            $this->info('SMTP autenticado correctamente. No se envió ningún correo.');
            $transport->stop();

            return self::SUCCESS;
        } catch (\Throwable $exception) {
            report($exception);
            $this->error('No se pudo autenticar SMTP: '.$exception->getMessage());

            return self::FAILURE;
        }
    }
}
