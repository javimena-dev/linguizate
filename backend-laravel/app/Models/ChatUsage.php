<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChatUsage extends Model
{
    protected $fillable = ['user_id', 'usage_day', 'count'];

    protected function casts(): array
    {
        return ['usage_day' => 'date'];
    }
}
