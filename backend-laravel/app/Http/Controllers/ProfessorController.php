<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\Game;
use App\Models\Question;
use App\Models\Subcategory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ProfessorController extends Controller
{
    public function index(Request $request)
    {
        return response()->json(['categories' => Category::where('owner_user_id', $request->user()->id)->where('kind', 'professor')->orderBy('created_at')->get()->map(fn ($c) => app(CatalogController::class)->category($c, true))]);
    }

    public function store(Request $request)
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:255'], 'description' => ['nullable', 'string']]);
        $id = 'prof_'.$request->user()->id.'_cat_'.Str::lower(Str::random(12));
        $code = $this->code();
        $category = DB::transaction(function () use ($request, $data, $id, $code) {
            $c = Category::create(['id' => $id, 'owner_user_id' => $request->user()->id, 'name' => trim($data['name']), 'description' => $data['description'] ?? '', 'kind' => 'professor', 'is_private' => true, 'approved' => true, 'access_code' => $code]);
            Subcategory::create(['id' => $id, 'category_id' => $id, 'name' => $c->name, 'description' => $c->description]);

            return $c;
        });

        return response()->json(['category' => app(CatalogController::class)->category($category, true)], 201);
    }

    public function update(Request $request, string $id)
    {
        $category = $this->owned($request, $id);
        $data = $request->validate(['name' => ['nullable', 'string', 'max:255'], 'description' => ['nullable', 'string']]);
        DB::transaction(function () use ($category, $data) {
            $category->update($data);
            Subcategory::where('category_id', $category->id)->update(array_intersect_key($data, array_flip(['name', 'description'])));
        });

        return response()->json(['category' => app(CatalogController::class)->category($category->fresh(), true)]);
    }

    public function storeQuestion(Request $request, string $id)
    {
        $category = $this->owned($request, $id);

        return $this->saveQuestion($request, new Question(['id' => 'prof_q_'.Str::lower(Str::random(20)), 'subcategory_id' => $category->id, 'owner_user_id' => $request->user()->id]), 201);
    }

    public function updateQuestion(Request $request, string $id)
    {
        $question = Question::whereKey($id)->where('owner_user_id', $request->user()->id)->firstOrFail();
        $target = $request->input('categoryId', $question->subcategory_id);
        $this->owned($request, $target);
        $question->subcategory_id = $target;

        return $this->saveQuestion($request, $question);
    }

    public function import(Request $request, string $id)
    {
        $category = $this->owned($request, $id);
        $data = $request->validate(['questions' => ['required', 'array', 'min:1', 'max:250']]);
        $errors = [];
        foreach ($data['questions'] as $i => $item) {
            $v = validator($item, $this->rules());
            if ($v->fails()) {
                $errors[] = ['row' => $i + 2, 'message' => 'Pregunta inválida'];
            }
        }
        if ($errors) {
            return response()->json(['error' => 'El archivo contiene filas inválidas', 'code' => 'INVALID_IMPORT', 'errors' => $errors], 400);
        }
        DB::transaction(function () use ($data, $category, $request) {
            foreach ($data['questions'] as $item) {
                $this->fill(new Question(['id' => 'prof_q_'.Str::lower(Str::random(20)), 'subcategory_id' => $category->id, 'owner_user_id' => $request->user()->id]), $item);
            }
        });

        return response()->json(['created' => count($data['questions']), 'skipped' => 0, 'errors' => []], 201);
    }

    public function statistics(Request $request)
    {
        $games = Game::query()->with('user')->whereHas('user')->whereIn('category_id', Category::where('owner_user_id', $request->user()->id)->pluck('id'))->orderByDesc('played_at')->get();

        return response()->json(['statistics' => $games->map(fn ($g) => ['studentName' => $g->user->name, 'categoryName' => $g->category_name, 'score' => $g->score, 'correctAnswers' => $g->correct_answers, 'incorrectAnswers' => $g->incorrect_answers, 'date' => $g->played_at->toIso8601String()])]);
    }

    public function deletionDisabled()
    {
        return response()->json(['error' => 'La eliminación está deshabilitada', 'code' => 'DELETE_DISABLED'], 405);
    }

    private function owned(Request $request, string $id): Category
    {
        return Category::whereKey($id)->where('owner_user_id', $request->user()->id)->where('kind', 'professor')->firstOrFail();
    }

    private function rules(): array
    {
        return ['question' => ['required', 'string'], 'options' => ['required', 'array', 'size:4'], 'options.*' => ['required', 'string'], 'correct' => ['required', 'integer', 'between:0,3'], 'difficulty' => ['required', 'in:facil,medio,dificil'], 'explanation' => ['nullable', 'string']];
    }

    private function saveQuestion(Request $request, Question $question, int $status = 200)
    {
        $data = $request->validate($this->rules());
        $this->fill($question, $data);

        return response()->json(['question' => app(CatalogController::class)->question($question)], $status);
    }

    private function fill(Question $q, array $data): void
    {
        $attributes = ['question' => trim($data['question']), 'options' => $data['options'], 'correct_index' => $data['correct'], 'difficulty' => $data['difficulty'], 'explanation' => $data['explanation'] ?? ''];
        if (! $q->exists) {
            $attributes['display_order'] = Question::where('subcategory_id', $q->subcategory_id)->count();
        }
        $q->fill($attributes)->save();
    }

    private function code(): string
    {
        do {
            $code = Str::upper(Str::random(6));
        } while (Category::where('access_code', $code)->exists());

        return $code;
    }
}
