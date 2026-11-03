<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Category extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected function casts(): array
    {
        return ['is_private' => 'boolean', 'approved' => 'boolean'];
    }

    public function subcategories()
    {
        return $this->hasMany(Subcategory::class)->orderBy('display_order');
    }

    public function owner()
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }
}
