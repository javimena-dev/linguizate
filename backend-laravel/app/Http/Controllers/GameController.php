<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\Game;
use App\Models\Question;
use App\Models\Subcategory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class GameController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'clientGameId' => ['required', 'string', 'max:191'], 'categoryId' => ['nullable', 'string'],
            'subcategoryId' => ['nullable', 'string'], 'categoryName' => ['nullable', 'string'], 'subcategoryName' => ['nullable', 'string'],
            'mode' => ['nullable', 'in:clasico,estudio'], 'playedAt' => ['nullable', 'date'],
            'attempts' => ['required', 'array', 'min:1', 'max:50'], 'attempts.*.questionId' => ['required', 'string'],
            'attempts.*.selectedOriginalIndex' => ['required', 'integer', 'between:0,3'], 'attempts.*.responseTimeSeconds' => ['nullable', 'numeric'],
        ]);
        $user = $request->user();
        if ($existing = Game::where('user_id', $user->id)->where('client_game_id', $data['clientGameId'])->first()) {
            return response()->json(['game' => $this->game($existing), 'user' => app(AuthController::class)->userData($user), 'duplicate' => true]);
        }
        $mode = $data['mode'] ?? 'clasico';
        $score = $correct = $incorrect = $streak = $best = 0;
        $time = 0;
        $seen = [];
        $attempts = [];
        foreach ($data['attempts'] as $item) {
            $question = Question::whereKey($item['questionId'])->where('subcategory_id', $data['subcategoryId'] ?? '')->first();
            $response = max(0, min(30, (float) ($item['responseTimeSeconds'] ?? 0)));
            $ok = $question && ! isset($seen[$item['questionId']]) && $item['selectedOriginalIndex'] === $question->correct_index;
            $seen[$item['questionId']] = true;
            if ($ok) {
                $correct++;
                $streak++;
                $best = max($best, $streak);
                $multiplier = $question->difficulty === 'dificil' ? 2 : ($question->difficulty === 'medio' ? 1.5 : 1);
                $bonus = $mode === 'clasico' ? (30 - $response) * 10 : 0;
                $score += (int) round((100 + $bonus) * $multiplier);
            } else {
                $incorrect++;
                $streak = 0;
            }
            $time += $response;
            $attempts[] = ['question_id' => $question?->id, 'is_correct' => $ok, 'response_time_seconds' => $response];
        }
        $game = DB::transaction(function () use ($user, $data, $mode, $score, $correct, $incorrect, $best, $time, $attempts) {
            $game = Game::create(['client_game_id' => $data['clientGameId'], 'user_id' => $user->id, 'category_id' => $data['categoryId'] ?? null,
                'subcategory_id' => $data['subcategoryId'] ?? null, 'category_name' => Category::find($data['categoryId'] ?? '')?->name ?? ($data['categoryName'] ?? '-'),
                'subcategory_name' => Subcategory::find($data['subcategoryId'] ?? '')?->name ?? ($data['subcategoryName'] ?? '-'), 'mode' => $mode,
                'score' => $score, 'correct_answers' => $correct, 'incorrect_answers' => $incorrect, 'best_streak' => $best,
                'avg_response_seconds' => count($attempts) ? $time / count($attempts) : 0, 'played_at' => $data['playedAt'] ?? now()]);
            $game->attempts()->createMany($attempts);
            $user->increment('score', $score);
            $user->increment('games_played');

            return $game;
        });

        return response()->json(['game' => $this->game($game), 'user' => app(AuthController::class)->userData($user->fresh())], 201);
    }

    public function history(Request $request)
    {
        return response()->json(['games' => Game::with('attempts')->where('user_id', $request->user()->id)->orderByDesc('played_at')->get()->map(fn ($g) => [
            ...$this->game($g), 'totalQuestions' => $g->correct_answers + $g->incorrect_answers,
            'questionResults' => $g->attempts->map(fn ($a) => ['questionId' => $a->question_id, 'isCorrect' => $a->is_correct, 'responseTimeSeconds' => $a->response_time_seconds]),
        ])]);
    }

    public function progress(Request $request)
    {
        $user = $request->user();
        $games = Game::where('user_id', $user->id)->get();
        $answers = $games->sum(fn ($g) => $g->correct_answers + $g->incorrect_answers);
        $correct = $games->sum('correct_answers');
        $dimensions = $games->groupBy(fn ($g) => $g->category_id ?: 'unknown')->map(function ($group, $id) {
            $total = $group->sum(fn ($g) => $g->correct_answers + $g->incorrect_answers);
            $correct = $group->sum('correct_answers');

            return ['categoryId' => $id, 'label' => $group->first()->category_name, 'correct' => $correct, 'total' => $total, 'accuracy' => $total ? round($correct / $total * 100) : 0];
        })->values();
        $accuracy = $answers ? round($correct / $answers * 100) : 0;
        $best = (int) $games->max('best_streak');
        $achievements = array_values(array_filter([$games->count() ? 'Primer paso' : null, $accuracy >= 80 && $answers >= 10 ? 'Precisión de oro' : null, $best >= 5 ? 'Racha lingüística' : null, $user->score >= 1000 ? 'Mil puntos' : null]));

        return response()->json(['summary' => ['score' => $user->score, 'gamesPlayed' => $games->count(), 'correctAnswers' => $correct, 'totalAnswers' => $answers, 'accuracy' => $accuracy, 'bestStreak' => $best], 'dimensions' => $dimensions, 'achievements' => $achievements]);
    }

    public function updateProfile(Request $request)
    {
        $data = $request->validate(['name' => ['nullable', 'string', 'max:100'], 'gender' => ['nullable', 'in:masculino,femenino,otro,neutro'], 'avatar' => ['nullable', 'string', 'max:1500000']]);
        $request->user()->update(array_filter($data, fn ($v) => $v !== null));

        return response()->json(['user' => app(AuthController::class)->userData($request->user()->fresh())]);
    }

    private function game(Game $g): array
    {
        return ['id' => $g->id, 'clientGameId' => $g->client_game_id, 'categoryId' => $g->category_id, 'subcategoryId' => $g->subcategory_id, 'categoryName' => $g->category_name, 'subcategoryName' => $g->subcategory_name, 'mode' => $g->mode, 'score' => $g->score, 'correctAnswers' => $g->correct_answers, 'incorrectAnswers' => $g->incorrect_answers, 'bestStreak' => $g->best_streak, 'avgResponseTimeSeconds' => $g->avg_response_seconds, 'date' => $g->played_at->toIso8601String()];
    }
}
