import { Popover as PopoverPrimitive } from '@base-ui/react/popover';

import { cn } from '@/lib/utils';

/** Popover 根容器 — 控制开关状态 */
function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

/** Popover 触发器 — 支持 base-ui `render` prop 的 as-child 模式 */
function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

/** Popover 内容容器 — Portal + Positioner + Popup 三层组合 */
interface PopoverContentProps extends PopoverPrimitive.Popup.Props {
  side?: PopoverPrimitive.Positioner.Props['side'];
  align?: PopoverPrimitive.Positioner.Props['align'];
  sideOffset?: PopoverPrimitive.Positioner.Props['sideOffset'];
  positionerClassName?: string;
}

function PopoverContent({
  className,
  side = 'bottom',
  align = 'center',
  sideOffset = 8,
  positionerClassName,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        className={cn('z-[1000]', positionerClassName)}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            'relative z-[1000] w-72 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-md data-starting-style:opacity-0 data-ending-style:opacity-0',
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
