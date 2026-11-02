<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        VerifyEmail::createUrlUsing(function (User $user) {
            return URL::temporarySignedRoute(
                'verification.verify',
                now()->addMinutes(config('auth.verification.expire', 60)),
                ['id' => $user->getKey(), 'hash' => sha1($user->getEmailForVerification())]
            );
        });

        VerifyEmail::toMailUsing(function (User $user, string $url) {
            return (new \Illuminate\Notifications\Messages\MailMessage)
                ->subject('Verifica tu correo de Lingüízate')
                ->greeting('Hola, '.$user->name.'!')
                ->line('Confirma tu correo para activar tu cuenta y usar el tutor de lingüística.')
                ->action('Verificar correo', $url)
                ->line('Si no creaste esta cuenta, ignora este correo.');
        });
    }
}
