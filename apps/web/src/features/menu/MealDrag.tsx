import {
  DndContext,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  type DateKey,
  isPastMeal,
  type Meal,
  type MealPlan,
} from '@family/shared';
import type { ReactNode } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { useSwapMeals } from './queries';

/** Задържане преди влачене на телефон, за да не се бърка със скрол. */
const TOUCH_HOLD_MS = 200;

/**
 * Влачене на редовете на менюто: пуснат върху друг ред от днес нататък, редът разменя деня си с него (оптимистично,
 * с връщане при грешка). `MouseSensor` и `TouchSensor`, а не `PointerSensor`: той хваща и докосването и би влачил
 * без задържане.
 */
export function MealDrag({
  plan,
  children,
}: {
  plan: MealPlan;
  children: ReactNode;
}) {
  const swap = useSwapMeals(plan.weekStart);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: TOUCH_HOLD_MS, tolerance: 8 },
    }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    const meal = plan.meals.find((m) => m.id === active.id);
    const withMeal = plan.meals.find((m) => m.id === over?.id);
    if (meal && withMeal && meal.id !== withMeal.id) {
      swap.mutate({ meal, withMeal });
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {swap.isError && <ErrorBox error={swap.error} />}
      {children}
    </DndContext>
  );
}

/**
 * Един ред, който се влачи за дръжката и приема друг ред; минал ден не е нито източник, нито цел. `children`
 * получава дръжката (или `undefined` за минал ден).
 */
export function DraggableMeal({
  meal,
  today,
  children,
}: {
  meal: Meal;
  today: DateKey;
  children: (handle: ReactNode) => ReactNode;
}) {
  const disabled = isPastMeal(meal, today);
  const drag = useDraggable({ id: meal.id, disabled });
  const drop = useDroppable({ id: meal.id, disabled });
  const { transform } = drag;
  const classes = [
    'meal-drag',
    drag.isDragging ? 'meal-drag--dragging' : '',
    drop.isOver && !drag.isDragging ? 'meal-drag--over' : '',
  ].filter(Boolean);

  return (
    <li
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      className={classes.join(' ')}
      style={
        transform
          ? { transform: `translate3d(0, ${transform.y}px, 0)` }
          : undefined
      }
    >
      {children(
        disabled ? undefined : (
          // Пътят с клавиатура и екранен четец е „Премести на…“ в листа, затова дръжката е само за пръст и мишка.
          <span
            ref={drag.setActivatorNodeRef}
            className="meal-drag__handle"
            aria-hidden="true"
            title="Задръж и влачи към друг ден"
            {...drag.listeners}
          >
            ⠿
          </span>
        ),
      )}
    </li>
  );
}
