<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;

class GoogleAuthController extends Controller
{
    public function redirect(Request $request): RedirectResponse
    {
        if ($returnTo = $this->safeReturnTo($request->query('return_to'))) {
            $request->session()->put('google_return_to', $returnTo);
        }

        return Socialite::driver('google')
            ->scopes(['openid', 'email', 'profile'])
            ->redirect();
    }

    public function callback(Request $request): RedirectResponse
    {
        try {
            $googleUser = Socialite::driver('google')->user();
            $email = Str::lower((string) $googleUser->getEmail());
            $raw = $googleUser->getRaw();

            if (! $email || ! filter_var($email, FILTER_VALIDATE_EMAIL) || empty($raw['email_verified'])) {
                return $this->failed($request, 'email_not_verified');
            }

            $user = User::where('google_id', $googleUser->getId())
                ->orWhere('email', $email)
                ->first();

            if ($user && $user->role !== 'estudiante') {
                return $this->failed($request, 'student_only');
            }

            if (! $user) {
                $user = new User([
                    'name' => Str::limit($googleUser->getName() ?: 'Estudiante', 100, ''),
                    'email' => $email,
                    'role' => 'estudiante',
                    'gender' => 'otro',
                ]);
            }

            $user->forceFill([
                'google_id' => $googleUser->getId(),
                'google_avatar' => $googleUser->getAvatar(),
                'email_verified_at' => $user->email_verified_at ?: now(),
            ])->save();

            Auth::login($user);
            $request->session()->regenerate();

            if ($returnTo = $request->session()->pull('google_return_to')) {
                return redirect()->to($returnTo);
            }

            return redirect()->away(rtrim(config('app.frontend_url'), '/').'/?auth=google');
        } catch (\Throwable $exception) {
            report($exception);

            return $this->failed($request, 'failed');
        }
    }

    private function failed(Request $request, string $reason): RedirectResponse
    {
        if ($returnTo = $request->session()->pull('google_return_to')) {
            $separator = str_contains($returnTo, '?') ? '&' : '?';

            return redirect()->to($returnTo.$separator.'google='.urlencode($reason));
        }

        return redirect()->away(rtrim(config('app.frontend_url'), '/').'/login?google='.$reason);
    }

    private function safeReturnTo(mixed $returnTo): ?string
    {
        if (! is_string($returnTo) || ! str_starts_with($returnTo, '/') || str_starts_with($returnTo, '//')) {
            return null;
        }

        return $returnTo;
    }
}
