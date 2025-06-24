import type {
  FormConfiguration,
  FormFieldRow,
  FormRowRendererProps
} from "@streamline/core";
import { FormBody } from "./FormBody";
import { FormField } from "./FormField";
import { FormSubmitButton } from "./FormSubmitButton";

export interface FormRowProps {
  row: FormFieldRow;
  className?: string;
}

export const DefaultFormRowRenderer = ({
  row,
  children,
  className,
  spacing,
  alignment,
}: FormRowRendererProps) => {
  const getColumnSpan = (totalFields: number, maxColumns: number) => {
    // Calculate how many columns each field should span
    if (totalFields === 1) return 12; // Full width
    if (totalFields === 2) return 6;  // Half width each
    if (totalFields === 3) return 4;  // Third width each
    return Math.floor(12 / totalFields); // Distribute evenly
  };

  const spacingClass = {
    tight: 'gap-2',
    normal: 'gap-4',
    loose: 'gap-6',
  }[spacing || row.spacing || 'normal'];

  const alignmentClass = {
    start: 'items-start',
    center: 'items-center',
    end: 'items-end',
    stretch: 'items-stretch',
  }[alignment || row.alignment || 'stretch'];

  return (
    <div 
      className={`streamline-form-row grid grid-cols-12 ${spacingClass} ${alignmentClass} ${className || ''}`}
      data-row-id={row.id}
      data-max-columns={row.maxColumns}
      data-spacing={row.spacing}
      data-alignment={row.alignment}
    >
      {children}
    </div>
  );
};

export function FormRow({ row, className }: FormRowProps) {
  // Les enfants sont les FormField wrappés dans des divs avec les bonnes classes
  const getColumnSpan = (totalFields: number) => {
    if (totalFields === 1) return 12;
    if (totalFields === 2) return 6;
    if (totalFields === 3) return 4;
    return Math.floor(12 / totalFields);
  };

  const columnSpan = getColumnSpan(row.fields.length);

  const children = (
    <>
      {row.fields.map((fieldConfig) => (
        <div
          key={fieldConfig.id}
          className={`col-span-${columnSpan}`}
          style={{ gridColumn: `span ${columnSpan}` }}
        >
          <FormField fieldConfig={fieldConfig} />
        </div>
      ))}
    </>
  );

  const rowProps: FormRowRendererProps = {
    row,
    children,
    className,
    spacing: row.spacing,
    alignment: row.alignment,
  };

  return DefaultFormRowRenderer(rowProps);
}

export interface FormRendererProps {
  formConfig: FormConfiguration;
  className?: string;
  rowClassName?: string;
  showFieldErrors?: boolean;
  showValidationIndicators?: boolean;
  showSubmitButton?: boolean;
  submitButtonProps?: {
    text?: string;
    loadingText?: string;
    className?: string;
  };
}

export function FormRenderer({
  formConfig,
  className,
  rowClassName,
  showFieldErrors = true,
  showValidationIndicators = true,
  showSubmitButton = true,
  submitButtonProps,
}: FormRendererProps) {
  const formRows = (
    <>
      {formConfig.rows.map((row) => {
        // Utilise le renderer personnalisé s'il est configuré
        if (formConfig.renderConfig?.rowRenderer) {
          const children = (
            <>
              {row.fields.map((fieldConfig) => {
                const getColumnSpan = (totalFields: number) => {
                  if (totalFields === 1) return 12;
                  if (totalFields === 2) return 6;
                  if (totalFields === 3) return 4;
                  return Math.floor(12 / totalFields);
                };

                const columnSpan = getColumnSpan(row.fields.length);

                return (
                  <div
                    key={fieldConfig.id}
                    className={`col-span-${columnSpan}`}
                    style={{ gridColumn: `span ${columnSpan}` }}
                  >
                    <FormField fieldConfig={fieldConfig} />
                  </div>
                );
              })}
            </>
          );

          const rowProps: FormRowRendererProps = {
            row,
            children,
            className: rowClassName,
            spacing: row.spacing,
            alignment: row.alignment,
          };

          return formConfig.renderConfig.rowRenderer(rowProps);
        }

        // Utilise le renderer par défaut
        return (
          <FormRow 
            key={row.id} 
            row={row} 
            className={rowClassName}
          />
        );
      })}
      
      {/* Global form validation summary (optional) */}
      {showFieldErrors && (
        <FormValidationSummary formConfig={formConfig} />
      )}
    </>
  );

  return (
    <div className={`streamline-form-renderer ${className || ''}`}>
      <FormBody formConfig={formConfig}>
        {formRows}
      </FormBody>
      
      {showSubmitButton && (
        <div className="streamline-form-actions mt-6">
          <FormSubmitButton 
            text={submitButtonProps?.text}
            loadingText={submitButtonProps?.loadingText}
            className={submitButtonProps?.className}
          />
        </div>
      )}
    </div>
  );
}

interface FormValidationSummaryProps {
  formConfig: FormConfiguration;
}

function FormValidationSummary({ formConfig }: FormValidationSummaryProps) {
  // This would be connected to form state to show global errors
  // For now, it's a placeholder that can be enhanced
  return null;
}

export default FormRenderer; 