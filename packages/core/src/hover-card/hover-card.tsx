/*!
 * Portions of this file are based on code from ariakit.
 * MIT Licensed, Copyright (c) Diego Haz.
 *
 * Credits to the Ariakit team:
 * https://github.com/ariakit/ariakit/blob/84e97943ad637a582c01c9b56d880cd95f595737/packages/ariakit/src/hovercard/hovercard.tsx
 */

import { createGlobalListeners, EventKey, mergeDefaultProps } from "@kobalte/utils";
import {
  createEffect,
  createSignal,
  createUniqueId,
  onCleanup,
  ParentComponent,
  splitProps,
} from "solid-js";

import { Popover, PopoverProps } from "../popover";
import { Placement } from "../popover/utils";
import { createDisclosureState } from "../primitives";
import { HoverCardContent } from "./hover-card-content";
import {
  HoverCardContext,
  HoverCardContextValue,
  useOptionalHoverCardContext,
} from "./hover-card-context";
import { HoverCardPositioner } from "./hover-card-positioner";
import { HoverCardTrigger } from "./hover-card-trigger";
import { getElementPolygon, getEventPoint, isPointInPolygon } from "./polygon";
import { isMovingOnHoverCard } from "./utils";

type HoverCardComposite = {
  Trigger: typeof HoverCardTrigger;
  Portal: typeof Popover.Portal;
  Positioner: typeof HoverCardPositioner;
  Content: typeof HoverCardContent;
  Arrow: typeof Popover.Arrow;
  CloseButton: typeof Popover.CloseButton;
  Title: typeof Popover.Title;
  Description: typeof Popover.Description;
};

export interface HoverCardProps extends Omit<PopoverProps, "onCurrentPlacementChange"> {
  /** The duration from when the mouse enters the trigger until the hovercard opens. */
  openDelay?: number;

  /** The duration from when the mouse leaves the trigger or content until the hovercard closes. */
  closeDelay?: number;

  /** Whether to close the hovercard when the user cursor move outside it. */
  closeOnHoverOutside?: boolean;

  /** Whether to close the hover card even if the user cursor is inside the safe area between the trigger and hovercard. */
  ignoreSafeArea?: boolean;
}

/**
 * A popover that allows sighted users to preview content available behind a link.
 */
export const HoverCard: ParentComponent<HoverCardProps> & HoverCardComposite = props => {
  const defaultId = `hovercard-${createUniqueId()}`;

  const parentContext = useOptionalHoverCardContext();

  props = mergeDefaultProps(
    {
      id: defaultId,
      openDelay: 700,
      closeDelay: 300,
      closeOnHoverOutside: true,
      trapFocus: false,
      autoFocus: false,
      restoreFocus: false,
    },
    props
  );

  const [local, others] = splitProps(props, [
    "isOpen",
    "defaultIsOpen",
    "onOpenChange",
    "openDelay",
    "closeDelay",
    "closeOnHoverOutside",
    "closeOnInteractOutside",
    "shouldCloseOnInteractOutside",
    "closeOnEsc",
    "ignoreSafeArea",
    "anchorRef",
  ]);

  let openTimeoutId: number | undefined;
  let closeTimeoutId: number | undefined;

  const [nestedHoverCardRefs, setNestedHoverCardRefs] = createSignal<HTMLElement[]>([]);
  const [triggerRef, setTriggerRef] = createSignal<HTMLElement>();
  const [positionerRef, setPositionerRef] = createSignal<HTMLElement>();
  const [contentRef, setContentRef] = createSignal<HTMLElement>();

  const [currentPlacement, setCurrentPlacement] = createSignal<Placement>(others.placement!);

  const anchorRef = () => local.anchorRef?.() ?? triggerRef();

  const disclosureState = createDisclosureState({
    isOpen: () => local.isOpen,
    defaultIsOpen: () => local.defaultIsOpen,
    onOpenChange: isOpen => local.onOpenChange?.(isOpen),
  });

  const { addGlobalListener, removeGlobalListener } = createGlobalListeners();

  // Close the hovercard and all its ancestors.
  const deepClose = () => {
    disclosureState.close();
    parentContext?.deepClose();
  };

  const openWithDelay = () => {
    openTimeoutId = window.setTimeout(() => {
      openTimeoutId = undefined;
      disclosureState.open();
    }, local.openDelay);
  };

  const closeWithDelay = () => {
    closeTimeoutId = window.setTimeout(() => {
      closeTimeoutId = undefined;
      disclosureState.close();
    }, local.closeDelay);
  };

  const cancelOpening = () => {
    window.clearTimeout(openTimeoutId);
    openTimeoutId = undefined;
  };

  const cancelClosing = () => {
    window.clearTimeout(closeTimeoutId);
    closeTimeoutId = undefined;
  };

  const isTargetOnHoverCard = (target: Node | undefined) => {
    return isMovingOnHoverCard(target, positionerRef(), anchorRef(), nestedHoverCardRefs());
  };

  const getPolygonSafeArea = (placement: Placement) => {
    const anchorEl = anchorRef();
    const panelEl = contentRef();

    if (!anchorEl || !panelEl) {
      return;
    }

    return getElementPolygon(panelEl, anchorEl, placement);
  };

  const registerNestedHoverCard = (element: HTMLElement) => {
    setNestedHoverCardRefs(prevElements => [...prevElements, element]);

    const parentUnregister = parentContext?.registerNestedHoverCard(element);

    return () => {
      setNestedHoverCardRefs(prevElements => prevElements.filter(item => item !== element));
      parentUnregister?.();
    };
  };

  const shouldCloseOnInteractOutside = (element: Element) => {
    if (local.shouldCloseOnInteractOutside == null) {
      return true;
    }

    return local.shouldCloseOnInteractOutside(element);
  };

  const onEscapeKeyDown = (event: KeyboardEvent) => {
    if (event.key === EventKey.Escape && local.closeOnEsc) {
      deepClose();
    }
  };

  const onInteractOutside = (event: PointerEvent | MouseEvent) => {
    const target = event.target as Node | undefined;

    // Don't close if the hovercard element has focus within or the mouse is moving through valid hovercard elements.
    if (isTargetOnHoverCard(target)) {
      return;
    }

    if (!local.closeOnInteractOutside) {
      return;
    }

    if (!shouldCloseOnInteractOutside(target as Element)) {
      return;
    }

    // Otherwise, hide the hovercard and all its ancestors.
    deepClose();
  };

  const onHoverOutside = (event: PointerEvent) => {
    const target = event.target as Node | undefined;

    // Don't close if the hovercard element has focus within or the mouse is moving through valid hovercard elements.
    if (isTargetOnHoverCard(target)) {
      cancelClosing();
      return;
    }

    if (!local.ignoreSafeArea) {
      const polygon = getPolygonSafeArea(currentPlacement());

      //Don't close if the current's event mouse position is inside the polygon safe area.
      if (polygon && isPointInPolygon(getEventPoint(event), polygon)) {
        cancelClosing();
        return;
      }
    }

    if (!local.closeOnHoverOutside) {
      cancelClosing();
      return;
    }

    // If there's already a scheduled timeout to hide the hovercard, we do nothing.
    if (closeTimeoutId) {
      return;
    }

    // Otherwise, hide the hovercard after the close delay.
    closeWithDelay();
  };

  // Register the hover card as a nested hover card on the parent hover card.
  createEffect(() => {
    if (!disclosureState.isOpen()) {
      return;
    }

    // Register the positioner instead of the panel because it's the top most element (excluding Portal).
    const positionerEl = positionerRef();

    if (!positionerEl || !parentContext) {
      return;
    }

    onCleanup(parentContext.registerNestedHoverCard(positionerEl));
  });

  createEffect(() => {
    if (!disclosureState.isOpen()) {
      return;
    }

    // Hide on Escape. Popover already handles this, but only when the
    // content or the trigger elements are focused. Since the
    // hovercard, by default, does not receive focus when it's shown, we need to
    // handle this globally here.
    addGlobalListener(document, "keydown", onEscapeKeyDown);

    // Checks whether the mouse is moving outside the hovercard.
    // If yes, hide the card after the close delay.
    addGlobalListener(document, "pointermove", onHoverOutside, true);

    // Checks whether the user is interacting outside the hovercard.
    // If yes, hide the card immediately.
    addGlobalListener(document, "pointerup", onInteractOutside, true);
    addGlobalListener(document, "contextmenu", onInteractOutside, true);

    onCleanup(() => {
      removeGlobalListener(document, "keydown", onEscapeKeyDown);
      removeGlobalListener(document, "pointermove", onHoverOutside, true);
      removeGlobalListener(document, "pointerup", onInteractOutside, true);
      removeGlobalListener(document, "contextmenu", onInteractOutside, true);
    });
  });

  // cleanup all timeout on unmount.
  onCleanup(() => {
    cancelOpening();
    cancelClosing();
  });

  const context: HoverCardContextValue = {
    isOpen: disclosureState.isOpen,
    openWithDelay,
    closeWithDelay,
    cancelOpening,
    cancelClosing,
    deepClose,
    isTargetOnHoverCard,
    registerNestedHoverCard,
    setTriggerRef,
    setPositionerRef,
    setContentRef,
  };

  return (
    <HoverCardContext.Provider value={context}>
      <Popover
        isOpen={disclosureState.isOpen()}
        onOpenChange={disclosureState.setIsOpen}
        anchorRef={anchorRef}
        onCurrentPlacementChange={setCurrentPlacement}
        closeOnInteractOutside={false}
        closeOnEsc={false}
        {...others}
      />
    </HoverCardContext.Provider>
  );
};

HoverCard.Trigger = HoverCardTrigger;
HoverCard.Portal = Popover.Portal;
HoverCard.Positioner = HoverCardPositioner;
HoverCard.Content = HoverCardContent;
HoverCard.Arrow = Popover.Arrow;
HoverCard.CloseButton = Popover.CloseButton;
HoverCard.Title = Popover.Title;
HoverCard.Description = Popover.Description;