import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { supabase } from "../lib/supabase";

export interface SortableItem {
  id: string;
  position: number;
}

/**
 * Wraps a list of items with vertical drag-and-drop. Persists new order to
 * the `event_items.position` column in Supabase.
 */
export function SortableList<T extends SortableItem>({
  items,
  table = "event_items",
  children,
}: {
  items: T[];
  table?: string;
  children: (item: T) => React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(items, oldIndex, newIndex);
    // Persist new positions (sequential, gives room to insert later)
    const updates = reordered.map((it, idx) => ({ id: it.id, position: idx }));

    // Run updates in parallel; UI will re-sort on the realtime echo.
    await Promise.all(
      updates.map((u) =>
        supabase.from(table).update({ position: u.position }).eq("id", u.id)
      )
    );
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => children(item))}
      </SortableContext>
    </DndContext>
  );
}

/**
 * Wrap each row in <SortableRow id={item.id}>. Renders a drag handle that
 * children can position themselves around.
 */
export function SortableRow({
  id,
  children,
  className = "",
  handleClassName = "text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing flex-shrink-0",
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  handleClassName?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : "auto",
  };
  return (
    <div ref={setNodeRef} style={style} className={className}>
      <button
        type="button"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
        className={handleClassName + " p-1 -ml-1 hidden sm:block"}
      >
        <GripVertical size={16} />
      </button>
      {children}
    </div>
  );
}
