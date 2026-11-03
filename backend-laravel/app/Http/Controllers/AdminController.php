<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\Question;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AdminController extends Controller
{
    public function users()
    {
        return response()->json(['users' => User::orderByDesc('score')->get()->map(fn ($u) => app(AuthController::class)->userData($u))]);
    }

    public function dashboard()
    {
        $users = User::with('games.attempts')->orderByDesc('score')->get()->map(function ($u) {
            $dto = app(AuthController::class)->userData($u);
            $dto['gameHistory'] = $u->games->map(fn ($g) => ['categoryName' => $g->category_name, 'subcategoryName' => $g->subcategory_name, 'score' => $g->score, 'date' => $g->played_at->toIso8601String(), 'totalQuestions' => $g->correct_answers + $g->incorrect_answers, 'correctAnswers' => $g->correct_answers, 'incorrectAnswers' => $g->incorrect_answers, 'avgResponseTimeSeconds' => $g->avg_response_seconds, 'questionResults' => $g->attempts->map(fn ($a) => ['questionId' => $a->question_id, 'isCorrect' => $a->is_correct, 'responseTimeSeconds' => $a->response_time_seconds])]);

            return $dto;
        });

        return response()->json(['users' => $users, 'totalUsers' => $users->where('role', '!=', 'admin')->count(), 'totalQuestions' => Question::count(), 'totalCategories' => Category::where('approved', true)->count()]);
    }

    public function categories()
    {
        return response()->json(['categories' => Category::orderBy('kind')->orderBy('display_order')->get()->map(fn ($c) => app(CatalogController::class)->category($c, true))]);
    }

    public function approval(Request $request, string $id)
    {
        $data = $request->validate(['approved' => ['required', 'boolean']]);
        $category = Category::findOrFail($id);
        $category->update($data);

        return response()->json(['category' => app(CatalogController::class)->category($category->fresh(), true)]);
    }

    public function questions()
    {
        $rows = Question::query()
            ->with('subcategory.category')
            ->withCount([
                'attempts',
                'attempts as correct_attempts_count' => fn ($query) => $query->where('is_correct', true),
            ])
            ->orderBy('subcategory_id')
            ->orderBy('display_order')
            ->orderBy('id')
            ->get();

        return response()->json(['questions' => $rows->map(function ($q) {
            $count = $q->attempts_count;
            $correct = $q->correct_attempts_count;

            return [...app(CatalogController::class)->question($q), 'subcategoryId' => $q->subcategory_id, 'subcategoryName' => $q->subcategory?->name, 'categoryName' => $q->subcategory?->category?->name, 'attemptCount' => $count, 'correctCount' => $correct, 'accuracyPercent' => $count ? round($correct / $count * 100) : null];
        })]);
    }

    public function storeQuestion(Request $request)
    {
        return $this->save($request, new Question(['id' => 'q_'.Str::lower(Str::random(20))]), 201);
    }

    public function updateQuestion(Request $request, string $id)
    {
        return $this->save($request, Question::findOrFail($id));
    }

    private function save(Request $request, Question $q, int $status = 200)
    {
        $d = $request->validate(['subcategoryId' => ['required', 'exists:subcategories,id'], 'question' => ['required', 'string'], 'options' => ['required', 'array', 'size:4'], 'options.*' => ['required', 'string'], 'correct' => ['required', 'integer', 'between:0,3'], 'difficulty' => ['required', 'in:facil,medio,dificil'], 'explanation' => ['nullable', 'string']]);
        $attributes = ['subcategory_id' => $d['subcategoryId'], 'question' => trim($d['question']), 'options' => $d['options'], 'correct_index' => $d['correct'], 'difficulty' => $d['difficulty'], 'explanation' => $d['explanation'] ?? ''];
        if (! $q->exists) {
            $attributes['display_order'] = Question::where('subcategory_id', $d['subcategoryId'])->count();
        }
        $q->fill($attributes)->save();

        return response()->json(['question' => app(CatalogController::class)->question($q)], $status);
    }

    public function deletionDisabled()
    {
        return response()->json(['error' => 'La eliminación está deshabilitada', 'code' => 'DELETE_DISABLED'], 405);
    }
}
