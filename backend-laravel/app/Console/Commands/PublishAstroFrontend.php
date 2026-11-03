<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use RuntimeException;

class PublishAstroFrontend extends Command
{
    protected $signature = 'frontend:publish';

    protected $description = 'Publica el build estático de Astro sin sobrescribir el front controller de Laravel';

    public function handle(): int
    {
        $source = base_path('frontend/dist');
        $manifestPath = storage_path('app/frontend-manifest.json');

        if (! File::isDirectory($source)) {
            $this->error('No existe frontend/dist. Ejecuta: npm run build --prefix frontend');

            return self::FAILURE;
        }

        $files = $this->collectFiles($source);
        $protected = ['.htaccess', 'index.php', 'web.config'];
        $conflicts = array_values(array_intersect($protected, array_keys($files)));

        if ($conflicts !== []) {
            $this->error('El build contiene archivos reservados: '.implode(', ', $conflicts));

            return self::FAILURE;
        }

        $previous = $this->readManifest($manifestPath);
        foreach (array_diff($previous, array_keys($files)) as $relative) {
            $target = public_path($relative);
            if (File::isFile($target) && ! in_array($relative, $protected, true)) {
                File::delete($target);
            }
        }

        foreach ($files as $relative => $absolute) {
            $target = public_path($relative);
            File::ensureDirectoryExists(dirname($target));
            File::copy($absolute, $target);
        }

        File::ensureDirectoryExists(dirname($manifestPath));
        File::put($manifestPath, json_encode(array_keys($files), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL);

        $this->info(sprintf('Frontend publicado: %d archivos en %s', count($files), public_path()));

        return self::SUCCESS;
    }

    /** @return array<string, string> */
    private function collectFiles(string $source): array
    {
        $source = rtrim(str_replace('\\', '/', $source), '/');
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($source, RecursiveDirectoryIterator::SKIP_DOTS)
        );
        $files = [];

        foreach ($iterator as $file) {
            if (! $file->isFile()) {
                continue;
            }

            $absolute = str_replace('\\', '/', $file->getPathname());
            $relative = ltrim(substr($absolute, strlen($source)), '/');
            if ($relative === '' || str_contains($relative, '../')) {
                throw new RuntimeException('Ruta de build no válida: '.$relative);
            }
            $files[$relative] = $file->getPathname();
        }

        ksort($files);

        return $files;
    }

    /** @return list<string> */
    private function readManifest(string $manifestPath): array
    {
        if (! File::isFile($manifestPath)) {
            return [];
        }

        $manifest = json_decode(File::get($manifestPath), true);

        return is_array($manifest)
            ? array_values(array_filter($manifest, fn ($path) => is_string($path) && ! str_contains($path, '../')))
            : [];
    }
}
