<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class TeacherInvitationNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly string $token) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $url = rtrim(config('app.frontend_url'), '/').'/aceptar-invitacion?token='.urlencode($this->token).'&email='.urlencode($notifiable->email);

        return (new MailMessage)->subject('Invitación docente a Lingüízate')->greeting('Hola, '.$notifiable->name)
            ->line('Administración creó tu cuenta docente.')->action('Definir contraseña', $url)
            ->line('La invitación vence en 24 horas y solo puede usarse una vez.');
    }
}
