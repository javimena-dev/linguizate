<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Game extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['played_at' => 'datetime', 'avg_response_seconds' => 'float'];
    }

    public function attempts()
    {
        return $this->hasMany(QuestionAttempt::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
