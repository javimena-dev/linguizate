<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureStudent
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->role !== 'estudiante') {
            return response()->json(['error' => 'Esta función es solo para estudiantes.', 'code' => 'STUDENT_ONLY'], 403);
        }

        return $next($request);
    }
}
