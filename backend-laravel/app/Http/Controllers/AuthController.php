<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'max:72', 'confirmed'],
            'gender' => ['nullable', 'in:masculino,femenino,otro'],
            'role' => ['nullable', 'in:estudiante'],
        ]);

        $user = User::create([
            'name' => trim($data['name']),
            'email' => Str::lower($data['email']),
            'password' => Hash::make($data['password']),
            'gender' => $data['gender'] ?? 'otro',
            'role' => 'estudiante',
        ]);

        event(new Registered($user));
        Auth::login($user);
        $request->session()->regenerate();

        return response()->json([
            'user' => $this->userData($user),
            'requiresVerification' => true,
            'message' => 'Revisa tu correo para verificar tu cuenta.',
        ], 201);
    }

    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => ['nullable', 'email', 'required_without:identifier'],
            'identifier' => ['nullable', 'string', 'required_without:email'],
            'password' => ['required', 'string'],
            'role' => ['nullable', 'in:estudiante,profesor,admin'],
            'remember' => ['nullable', 'boolean'],
        ]);

        $identifier = Str::lower(trim($data['email'] ?? $data['identifier']));
        $user = User::query()->whereRaw('LOWER(email) = ?', [$identifier])->orWhereRaw('LOWER(username) = ?', [$identifier])->first();
        $valid = $user && $user->password && Hash::check($data['password'], $user->password);
        if (! $valid) {
            return response()->json(['error' => 'Correo o contraseña incorrectos.', 'code' => 'INVALID_CREDENTIALS'], 422);
        }

        if (isset($data['role']) && $data['role'] !== $user->role) {
            return response()->json(['error' => 'El tipo de usuario no coincide con la cuenta.', 'code' => 'ROLE_MISMATCH'], 403);
        }
        if (Hash::needsRehash($user->password)) {
            $user->forceFill(['password' => Hash::make($data['password'])])->save();
        }
        Auth::guard('web')->login($user, $request->boolean('remember'));
        $request->session()->regenerate();

        return response()->json([
            'user' => $this->userData($user),
            'requiresVerification' => ! $user->hasVerifiedEmail(),
        ]);
    }

    public function session(Request $request)
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            return response()->json(['error' => 'Sesión no iniciada.', 'code' => 'UNAUTHENTICATED'], 401);
        }

        return response()->json(['user' => $this->userData($user)]);
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    public function resendVerification(Request $request)
    {
        /** @var User $user */
        $user = $request->user();
        if ($user->hasVerifiedEmail()) {
            return response()->json(['message' => 'Tu correo ya fue verificado.']);
        }

        $key = 'verification:'.$user->id;
        if (RateLimiter::tooManyAttempts($key, 3)) {
            return response()->json(['error' => 'Espera un momento antes de reenviar el correo.', 'code' => 'TOO_MANY_REQUESTS'], 429);
        }

        RateLimiter::hit($key, 300);
        $user->sendEmailVerificationNotification();

        return response()->json(['message' => 'Correo de verificación reenviado.']);
    }

    public function forgotPassword(Request $request)
    {
        $data = $request->validate(['email' => ['required', 'email']]);
        Password::sendResetLink(['email' => Str::lower($data['email'])]);

        return response()->json(['message' => 'Si la cuenta existe, enviamos las instrucciones al correo.']);
    }

    public function resetPassword(Request $request)
    {
        $data = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'string', 'min:8', 'max:72', 'confirmed'],
        ]);

        $status = Password::reset($data, function (User $user, string $password) {
            $user->forceFill([
                'password' => Hash::make($password),
                'remember_token' => Str::random(60),
            ])->save();

            DB::table('sessions')->where('user_id', $user->id)->delete();
            event(new PasswordReset($user));
        });

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json(['error' => __($status), 'code' => 'INVALID_RESET_TOKEN'], 422);
        }

        return response()->json(['message' => 'Contraseña actualizada. Ya puedes iniciar sesión.']);
    }

    public function userData(User $user): array
    {
        return [
            'id' => $user->id,
            'email' => $user->email,
            'name' => $user->name,
            'role' => $user->role,
            'isAdmin' => $user->role === 'admin',
            'isProfesor' => $user->role === 'profesor',
            'isEstudiante' => $user->role === 'estudiante',
            'score' => $user->score,
            'gamesPlayed' => $user->games_played,
            'avatar' => $user->avatar ?: $user->google_avatar,
            'gender' => $user->gender,
            'achievements' => $user->achievements ?? [],
            'createdAt' => $user->created_at?->toIso8601String(),
            'emailVerified' => $user->hasVerifiedEmail(),
            'authMethods' => array_values(array_filter([
                $user->password ? 'password' : null,
                $user->google_id ? 'google' : null,
            ])),
        ];
    }
}
