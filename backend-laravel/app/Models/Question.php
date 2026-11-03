<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Question extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected function casts(): array
    {
        return ['options' => 'array'];
    }

    public function subcategory()
    {
        return $this->belongsTo(Subcategory::class);
    }

    public function attempts()
    {
        return $this->hasMany(QuestionAttempt::class);
    }
}
