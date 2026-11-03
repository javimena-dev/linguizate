# Componentes UI

Controles nativos accesibles con estilos de Lingüízate. Importa desde `src/components/ui/`.

- `TextInput`, `TextArea`, `Select`, `RadioGroup`, `Checkbox`, `Switch` y `FileUpload` cubren campos y selección.
- `Button` usa variantes `primary`, `secondary` y `quiet`; combinar con `setButtonLoading` de `scripts/feedback` para acciones asíncronas.
- `Modal` usa `<dialog>` nativo y cierra con Escape, botón de cierre o clic en fondo.
- `Avatar` muestra imagen o iniciales; `AvatarPicker` presenta seis presets y prepara fotos cuadradas WebP con arrastre y zoom.
- `ResponsiveTable` da scroll horizontal accesible a tablas anchas; `EmptyState` presenta vistas sin datos.

Los controles usan `.ui-control`, tokens CSS compartidos y tema claro/oscuro. Los formularios deben pasar `id` y etiqueta visible.
