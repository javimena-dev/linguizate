<?php

namespace App\Http\Controllers;

use App\Models\ChatUsage;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;

class ChatController extends Controller
{
    public function usage(Request $request)
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json($this->usageData($user));
    }

    public function stream(Request $request)
    {
        $data = $request->validate([
            'message' => ['nullable', 'string', 'min:1', 'max:4000', 'required_without:userMessage'],
            'userMessage' => ['nullable', 'string', 'min:1', 'max:4000', 'required_without:message'],
            'question' => ['nullable', 'string', 'max:4000'],
            'explanation' => ['nullable', 'string', 'max:6000'],
            'history' => ['nullable', 'array', 'max:12'],
            'history.*.role' => ['required_with:history', 'in:user,assistant'],
            'history.*.content' => ['required_with:history', 'string', 'max:4000'],
        ]);
        /** @var User $user */
        $user = $request->user();

        $rateKey = 'chat:minute:'.$user->id;
        if (RateLimiter::tooManyAttempts($rateKey, 12)) {
            return response()->json(['error' => 'Espera un minuto antes de enviar más mensajes.', 'code' => 'RATE_LIMITED'], 429);
        }
        RateLimiter::hit($rateKey, 60);

        $usage = $this->reserveQuestion($user);
        if (! $usage) {
            return response()->json([
                'error' => 'Alcanzaste el límite diario de preguntas.',
                'code' => 'DAILY_LIMIT',
                ...$this->usageData($user),
            ], 429);
        }

        if (! config('services.groq.key')) {
            $this->releaseQuestion($user);

            return response()->json(['error' => 'El tutor no está configurado todavía.', 'code' => 'CHAT_NOT_CONFIGURED'], 503);
        }

        $messages = [[
            'role' => 'system',
            'content' => 'Eres el Tutor de Lingüística IA de Lingüízate. Responde en español, de forma clara y útil. Atiende saludos y preguntas sobre lingüística, idiomas, gramática, traducción, escritura y contenidos relacionados con el juego. Si la consulta no corresponde, explica amablemente que solo puedes ayudar con esos temas y ofrece una alternativa relacionada. Puedes redactar textos largos educativos cuando se soliciten. Usa Markdown sencillo cuando ayude a comprender.'.(! empty($data['question']) ? "\nPregunta de trivia: ".$data['question'] : '').(! empty($data['explanation']) ? "\nExplicación: ".$data['explanation'] : ''),
        ]];
        foreach ($data['history'] ?? [] as $message) {
            $messages[] = ['role' => $message['role'], 'content' => $message['content']];
        }
        $messages[] = ['role' => 'user', 'content' => $data['message'] ?? $data['userMessage']];

        try {
            $response = Http::withToken(config('services.groq.key'))
                ->acceptJson()
                ->connectTimeout(config('chat.connect_timeout'))
                ->timeout(config('chat.timeout'))
                ->withOptions(['stream' => true])
                ->post('https://api.groq.com/openai/v1/chat/completions', [
                    'model' => config('chat.model'),
                    'messages' => $messages,
                    'stream' => true,
                    'temperature' => 0.5,
                    'max_tokens' => 900,
                ]);
        } catch (\Throwable $exception) {
            report($exception);
            $this->releaseQuestion($user);

            return response()->json(['error' => 'El tutor tardó demasiado. Intenta de nuevo.', 'code' => 'GROQ_TIMEOUT'], 504);
        }

        if (! $response->successful()) {
            report(new \RuntimeException('Groq error: '.$response->status().' '.$response->body()));
            $this->releaseQuestion($user);

            return response()->json(['error' => 'El tutor no pudo responder. Intenta de nuevo.', 'code' => 'GROQ_ERROR'], 502);
        }

        $payload = $this->usageData($user);
        $body = $response->toPsrResponse()->getBody();
        $headers = [
            'Content-Type' => 'application/x-ndjson; charset=utf-8',
            'Cache-Control' => 'no-cache, no-transform',
            'X-Accel-Buffering' => 'no',
        ];

        return response()->stream(function () use ($body, $payload, $user) {
            session_write_close();
            echo str_repeat(' ', 4096)."\n";
            echo json_encode(['type' => 'meta', ...$payload], JSON_UNESCAPED_UNICODE)."\n";
            $this->flush();

            $buffer = '';
            $completed = false;
            try {
                while (! $body->eof()) {
                    $buffer .= $body->read(8192);
                    while (($position = strpos($buffer, "\n")) !== false) {
                        $line = trim(substr($buffer, 0, $position));
                        $buffer = substr($buffer, $position + 1);
                        if (! str_starts_with($line, 'data:')) {
                            continue;
                        }
                        $data = trim(substr($line, 5));
                        if ($data === '[DONE]') {
                            $completed = true;
                            break 2;
                        }
                        $event = json_decode($data, true);
                        $delta = $event['choices'][0]['delta']['content'] ?? null;
                        if (is_string($delta) && $delta !== '') {
                            echo json_encode(['type' => 'delta', 'delta' => $delta], JSON_UNESCAPED_UNICODE)."\n";
                            $this->flush();
                        }
                    }
                }
            } catch (\Throwable $exception) {
                report($exception);
            }

            if (! $completed) {
                $this->releaseQuestion($user);
                echo json_encode(['type' => 'error', 'error' => 'La respuesta tardó demasiado. Intenta de nuevo.', 'code' => 'GROQ_TIMEOUT', ...$this->usageData($user)], JSON_UNESCAPED_UNICODE)."\n";
            } else {
                echo json_encode(['type' => 'done'], JSON_UNESCAPED_UNICODE)."\n";
            }
            $this->flush();
        }, 200, $headers);
    }

    private function reserveQuestion(User $user): ?ChatUsage
    {
        $day = Carbon::now(config('app.timezone'))->toDateString();

        return DB::transaction(function () use ($user, $day) {
            $usage = ChatUsage::query()->where('user_id', $user->id)->whereDate('usage_day', $day)->lockForUpdate()->first();
            if (! $usage) {
                $usage = ChatUsage::create(['user_id' => $user->id, 'usage_day' => $day, 'count' => 0]);
            }
            if ($usage->count >= config('chat.daily_limit')) {
                return null;
            }
            $usage->increment('count');

            return $usage;
        });
    }

    private function releaseQuestion(User $user): void
    {
        $day = Carbon::now(config('app.timezone'))->toDateString();
        ChatUsage::query()->where('user_id', $user->id)->whereDate('usage_day', $day)->where('count', '>', 0)->decrement('count');
    }

    private function usageData(User $user): array
    {
        $day = Carbon::now(config('app.timezone'))->toDateString();
        $used = (int) ChatUsage::query()->where('user_id', $user->id)->whereDate('usage_day', $day)->value('count');
        $limit = config('chat.daily_limit');

        return [
            'limit' => $limit,
            'used' => $used,
            'remaining' => max(0, $limit - $used),
            'resetsAt' => Carbon::tomorrow(config('app.timezone'))->startOfDay()->toIso8601String(),
        ];
    }

    private function flush(): void
    {
        if (ob_get_level() > 0) {
            @ob_flush();
        }
        flush();
    }
}
