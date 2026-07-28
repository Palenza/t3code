import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { cn } from "~/lib/utils";

/**
 * Sortable shell around one sidebar thread row.
 *
 * Owns the `<li>` (the row components render plain content), the drag ref and
 * the transform, so the rows themselves stay ignorant of ordering. The
 * pointer sensor upstream requires an 8 px drag before activating: plain
 * clicks, double-clicks and context menus keep working untouched.
 */
export function SortableThreadItem({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: disabled === true,
  });
  return (
    <li
      ref={setNodeRef}
      data-thread-item
      className={cn("relative list-none", isDragging && "z-20 opacity-85")}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      {children}
    </li>
  );
}
