<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\UserInvitation;
use App\Notifications\TeacherInvitationNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class InvitationController extends Controller
{
    public function createTeacher(Request $request)
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:100'], 'email' => ['required', 'email', 'max:255', 'unique:users,email']]);
        [$user, $plain] = DB::transaction(function () use ($request, $data) {
            $user = User::create(['name' => trim($data['name']), 'email' => Str::lower($data['email']), 'role' => 'profesor', 'gender' => 'otro', 'password' => null]);

            return [$user, $this->issue($user, $request->user())];
        });
        $user->notify(new TeacherInvitationNotification($plain));

        return response()->json(['user' => app(AuthController::class)->userData($user), 'message' => 'Invitación docente enviada.'], 201);
    }

    public function resend(Request $request, User $user)
    {
        abort_unless($user->role === 'profesor' && ! $user->password, 422);
        $plain = $this->issue($user, $request->user());
        $user->notify(new TeacherInvitationNotification($plain));

        return response()->json(['message' => 'Invitación reenviada.']);
    }

    public function accept(Request $request)
    {
        $data = $request->validate(['email' => ['required', 'email'], 'token' => ['required', 'string'], 'password' => ['required', 'string', 'min:8', 'max:72', 'confirmed']]);
        $user = User::where('email', Str::lower($data['email']))->where('role', 'profesor')->first();
        $invitation = $user ? UserInvitation::where('user_id', $user->id)->whereNull('accepted_at')->first() : null;
        if (! $invitation || $invitation->expires_at->isPast() || ! hash_equals($invitation->token, hash('sha256', $data['token']))) {
            return response()->json(['error' => 'Invitación inválida o vencida.', 'code' => 'INVALID_INVITATION'], 422);
        }
        DB::transaction(function () use ($user, $invitation, $data) {
            $user->forceFill(['password' => Hash::make($data['password']), 'email_verified_at' => now()])->save();
            $invitation->update(['accepted_at' => now()]);
        });

        return response()->json(['message' => 'Cuenta docente activada. Ya puedes iniciar sesión.']);
    }

    private function issue(User $user, User $admin): string
    {
        $plain = Str::random(64);
        UserInvitation::updateOrCreate(['user_id' => $user->id], ['created_by_user_id' => $admin->id, 'token' => hash('sha256', $plain), 'expires_at' => now()->addDay(), 'accepted_at' => null]);

        return $plain;
    }
}
