<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\Question;
use App\Models\Subcategory;
use App\Models\User;
use Illuminate\Http\Request;

class CatalogController extends Controller
{
    public function catalog()
    {
        $categories = Category::query()->where('kind', 'system')->with(['subcategories' => fn ($q) => $q->withCount('questions')])->orderBy('display_order')->get();

        return response()->json(['categories' => $categories->map(fn ($c) => [
            'id' => $c->id, 'name' => $c->name, 'description' => $c->description ?? '', 'icon' => $c->icon,
            'subcategories' => $c->subcategories->map(fn ($s) => [
                'id' => $s->id, 'name' => $s->name, 'description' => $s->description ?? '', 'icon' => $s->icon,
                'questionCount' => $s->questions_count,
            ])->values(),
        ])->values()]);
    }

    public function questions(string $id)
    {
        $subcategory = Subcategory::query()->whereKey($id)->whereHas('category', fn ($q) => $q->where('kind', 'system'))->first();
        if (! $subcategory) {
            return response()->json(['error' => 'Subcategoría no encontrada', 'code' => 'SUBCATEGORY_NOT_FOUND'], 404);
        }

        return response()->json(['questions' => Question::query()->where('subcategory_id', $id)->orderBy('display_order')->get()->map(fn ($q) => $this->question($q))]);
    }

    public function ranking()
    {
        $users = User::query()->where('role', '!=', 'admin')->orderByDesc('score')->orderBy('id')->get();

        return response()->json(['users' => $users->map(fn ($u) => [
            'id' => $u->id, 'name' => $u->name, 'role' => $u->role, 'isProfesor' => $u->role === 'profesor',
            'isEstudiante' => $u->role === 'estudiante', 'avatar' => $u->avatar ?: $u->google_avatar,
            'score' => $u->score, 'gamesPlayed' => $u->games_played, 'achievements' => $u->achievements ?? [],
        ])]);
    }

    public function join(Request $request)
    {
        $data = $request->validate(['accessCode' => ['required', 'string', 'max:16']]);
        $category = Category::query()->where('access_code', strtoupper(trim($data['accessCode'])))->where('kind', 'professor')->where('approved', true)->first();
        if (! $category) {
            return response()->json(['error' => 'Código no válido', 'code' => 'INVALID_ACCESS_CODE'], 404);
        }

        return response()->json(['category' => $this->category($category, true)]);
    }

    public function category(Category $category, bool $questions = false): array
    {
        $category->load(['subcategories.questions']);
        $subs = $category->subcategories->map(fn ($s) => [
            'id' => $s->id, 'name' => $s->name, 'description' => $s->description ?? '', 'icon' => $s->icon,
            'questionCount' => $s->questions->count(),
            ...($questions ? ['questions' => $s->questions->map(fn ($q) => $this->question($q))->values()] : []),
        ])->values();
        $dto = ['id' => $category->id, 'name' => $category->name, 'description' => $category->description ?? '', 'icon' => $category->icon,
            'isPersonal' => $category->kind === 'professor', 'private' => $category->is_private, 'approved' => $category->approved,
            'accessCode' => $category->access_code, 'profesorId' => $category->owner_user_id, 'subcategories' => $subs];
        if ($category->kind === 'professor') {
            $dto['questions'] = $questions ? ($subs->first()['questions'] ?? []) : null;
        }

        return $dto;
    }

    public function question(Question $q): array
    {
        return ['id' => $q->id, 'question' => $q->question, 'options' => $q->options, 'correct' => $q->correct_index,
            'difficulty' => $q->difficulty, 'explanation' => $q->explanation ?? ''];
    }
}
