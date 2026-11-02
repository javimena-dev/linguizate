<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureEmailVerified
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()?->hasVerifiedEmail()) {
            return response()->json(['error' => 'Verifica tu correo para continuar.', 'code' => 'EMAIL_NOT_VERIFIED'], 403);
        }

        return $next($request);
    }
}
