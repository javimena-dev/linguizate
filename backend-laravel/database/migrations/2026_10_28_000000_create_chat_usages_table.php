<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_usages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('usage_day');
            $table->unsignedSmallInteger('count')->default(0);
            $table->timestamps();
            $table->unique(['user_id', 'usage_day']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_usages');
    }
};
