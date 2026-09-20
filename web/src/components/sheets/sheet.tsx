"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type ComponentProps,
} from "react";
import { createPortal } from "react-dom";
const FooterContext = createContext<HTMLElement | null>(null);
const FormContext = createContext<string | undefined>(undefined);
/** Native form ownership preserves Enter, validation and submit outside the scroll area. */
export function SheetForm({ children, id, ...props }: ComponentProps<"form">) {
  const generatedId = useId();
  const formId = id ?? generatedId;
  return (
    <FormContext.Provider value={formId}>
      <form {...props} id={formId}>
        {children}
      </form>
    </FormContext.Provider>
  );
}
function associateForm(
  children: ReactNode,
  form: string | undefined,
): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const element = child as ReactElement<{
      children?: ReactNode;
      form?: string;
    }>;
    const control =
      typeof element.type === "string" &&
      ["button", "input", "select", "textarea"].includes(element.type);
    return cloneElement(element, {
      ...(control && form ? { form: element.props.form ?? form } : {}),
      ...(element.props.children !== undefined
        ? { children: associateForm(element.props.children, form) }
        : {}),
    });
  });
}
export function SheetFooter({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const host = useContext(FooterContext),
    form = useContext(FormContext);
  return host
    ? createPortal(
        <div className={`sheet-actions ${className}`}>
          {associateForm(children, form)}
        </div>,
        host,
      )
    : null;
}
export function Sheet({
  open,
  onClose,
  title,
  description,
  titleExtra,
  children,
  wide = false,
  className = "",
  hasChanges,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  titleExtra?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  className?: string;
  hasChanges?: boolean;
}) {
  const [dirty, setDirty] = useState(false),
    [discard, setDiscard] = useState(false),
    [footer, setFooter] = useState<HTMLElement | null>(null);
  const changed = hasChanges ?? dirty,
    content = useRef<HTMLDivElement>(null),
    descriptionId = useId();
  useEffect(() => {
    if (!changed) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [changed]);
  function close() {
    if (discard) setDiscard(false);
    else if (changed && content.current?.querySelector("form"))
      setDiscard(true);
    else onClose();
  }
  return (
    <Dialog.Root open={open} onOpenChange={(value) => !value && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay" />
        <Dialog.Content
          onEscapeKeyDown={(event) => {
            // Let an open combobox handle Escape before dismissing its sheet.
            if (
              (event.target as HTMLElement)?.closest(
                '[role="combobox"][aria-expanded="true"]',
              )
            )
              event.preventDefault();
          }}
          ref={content}
          className={`sheet ${wide ? "sheet-wide" : ""} ${className}`}
          aria-describedby={description ? descriptionId : undefined}
          onInputCapture={(e) => {
            if (
              !(e.target as HTMLElement)
                .getAttribute("aria-label")
                ?.startsWith("搜索")
            )
              setDirty(true);
          }}
          onClickCapture={(e) => {
            if (
              (e.target as HTMLElement).closest(
                'button[aria-pressed],button[role="checkbox"]',
              )
            )
              setDirty(true);
          }}
        >
          <div className="sheet-handle" />
          <header className="sheet-header">
            <div>
              <div className="sheet-title-line">
                <Dialog.Title>{discard ? "尚未保存" : title}</Dialog.Title>
                {!discard && titleExtra}
              </div>
              {description && (
                <Dialog.Description id={descriptionId}>
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close className="icon-button" aria-label="关闭">
              <X size={22} />
            </Dialog.Close>
          </header>
          <FooterContext.Provider value={footer}>
            <FormContext.Provider value={undefined}>
              <div className="sheet-body" hidden={discard}>
                {children}
              </div>
              <footer
                className="sheet-footer"
                ref={setFooter}
                hidden={discard}
              />
            </FormContext.Provider>
          </FooterContext.Provider>
          {discard && (
            <>
              <div className="sheet-body discard-prompt" role="alert">
                <p>还有未保存的内容，要继续编辑吗？</p>
              </div>
              <footer className="sheet-footer">
                <div className="sheet-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={onClose}
                  >
                    放弃修改并关闭
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => setDiscard(false)}
                  >
                    继续编辑
                  </button>
                </div>
              </footer>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
