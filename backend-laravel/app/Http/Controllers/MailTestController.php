<?php

namespace App\Http\Controllers;

use App\Mail\SmtpProbe;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;

class MailTestController extends Controller
{
    /**
     * Sends a deliberately simple message to prove that Laravel can authenticate
     * with the configured SMTP provider. It is intentionally unavailable in production.
     */
    public function send(Request $request)
    {
        abort_unless(app()->environment(['local', 'testing']), 404);

        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
        ]);

        try {
            Mail::to($data['email'])->send(new SmtpProbe);

            return response()->json([
                'message' => 'Laravel entregó el mensaje al servidor SMTP. Revisa la bandeja de entrada y spam del destinatario.',
            ]);
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json([
                'error' => 'Laravel no pudo entregar el mensaje al servidor SMTP. Revisa storage/logs/laravel.log para el detalle técnico.',
                'code' => 'SMTP_SEND_FAILED',
            ], 502);
        }
    }
}
