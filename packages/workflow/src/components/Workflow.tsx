import type React from 'react';
import { useEffect, useState } from 'react';
import { RilayLicenseManager } from '../licensing/RilayLicenseManager';
import type { WorkflowProviderProps } from './WorkflowProvider';
import { WorkflowProvider } from './WorkflowProvider';

export type WorkflowProps = Omit<WorkflowProviderProps, 'children'> & {
  children: React.ReactNode;
};

/**
 * A wrapper component for the Rilay workflow system.
 * It simplifies the API by wrapping the WorkflowProvider and providing a clean,
 * component-based interface for building workflows.
 */
export function Workflow({ children, ...props }: WorkflowProps) {
  const [isClient, setIsClient] = useState(false);
  const shouldDisplayWatermark = RilayLicenseManager.shouldDisplayWatermark();
  const watermarkMessage = RilayLicenseManager.getWatermarkMessage();

  // Initialize license manager and check watermark only on client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <WorkflowProvider {...props}>{children}</WorkflowProvider>

      {isClient && shouldDisplayWatermark && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'monospace',
            zIndex: 1000,
            pointerEvents: 'none',
            opacity: 0.7,
          }}
        >
          {watermarkMessage}
        </div>
      )}
    </div>
  );
}

export default Workflow;
