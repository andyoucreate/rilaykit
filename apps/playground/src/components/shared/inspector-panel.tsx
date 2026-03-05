import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Bug } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { StateInspector } from './state-inspector';

// Simple context to pass store API from form/workflow pages
import { createContext, useContext } from 'react';

// Stable references to avoid useSyncExternalStore infinite loop
const EMPTY_STATE = {};
const NOOP_SUBSCRIBE = () => () => {};
const NOOP_GET_STATE = () => EMPTY_STATE;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface InspectorStore {
  subscribe: (cb: () => void) => () => void;
  getState: () => any;
}

const InspectorStoreContext = createContext<InspectorStore | null>(null);

export function InspectorStoreProvider({
  store,
  children,
}: {
  store: { subscribe: (...args: any[]) => any; getState: () => any };
  children: React.ReactNode;
}) {
  return (
    <InspectorStoreContext.Provider value={store as InspectorStore}>
      {children}
    </InspectorStoreContext.Provider>
  );
}

export function InspectorPanel() {
  const [open, setOpen] = useState(false);
  const store = useContext(InspectorStoreContext);

  // Keyboard shortcut: Ctrl+Shift+I
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const state = useSyncExternalStore(
    store?.subscribe ?? NOOP_SUBSCRIBE,
    store?.getState ?? NOOP_GET_STATE
  );

  const values = (state as any)?.values ?? {};
  const errors = (state as any)?.errors ?? {};
  const touched = (state as any)?.touched ?? {};
  const validationStates = (state as any)?.validationStates ?? {};

  const errorCount = Object.values(errors).filter(
    (e: any) => Array.isArray(e) && e.length > 0
  ).length;

  return (
    <>
      {/* Floating button */}
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          size="sm"
          variant="outline"
          className="relative shadow-lg"
          onClick={() => setOpen(!open)}
        >
          <Bug className="mr-1.5 size-4" />
          Inspector
          {errorCount > 0 && (
            <Badge variant="destructive" className="ml-1.5 px-1.5 py-0 text-xs">
              {errorCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Panel */}
      {open && (
        <div
          className={cn(
            'fixed inset-x-0 bottom-0 z-40 border-t bg-background shadow-2xl',
            'animate-in slide-in-from-bottom duration-200'
          )}
        >
          <div className="mx-auto max-h-[40vh] overflow-y-auto p-4">
            {!store ? (
              <p className="text-sm text-muted-foreground">
                No active form or workflow on this page.
              </p>
            ) : (
              <Tabs defaultValue="values">
                <TabsList>
                  <TabsTrigger value="values">Values</TabsTrigger>
                  <TabsTrigger value="errors">
                    Errors
                    {errorCount > 0 && (
                      <Badge variant="destructive" className="ml-1.5 px-1 py-0 text-xs">
                        {errorCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="touched">Touched</TabsTrigger>
                  <TabsTrigger value="validation">Validation</TabsTrigger>
                  <TabsTrigger value="raw">Store Raw</TabsTrigger>
                </TabsList>
                <TabsContent value="values" className="mt-3">
                  <StateInspector data={values} label="Form Values" />
                </TabsContent>
                <TabsContent value="errors" className="mt-3">
                  <StateInspector data={errors} label="Field Errors" />
                </TabsContent>
                <TabsContent value="touched" className="mt-3">
                  <StateInspector data={touched} label="Touched Fields" />
                </TabsContent>
                <TabsContent value="validation" className="mt-3">
                  <StateInspector data={validationStates} label="Validation States" />
                </TabsContent>
                <TabsContent value="raw" className="mt-3">
                  <StateInspector
                    data={state as Record<string, unknown>}
                    label="Full Store State"
                  />
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      )}
    </>
  );
}
