declare module '@parallax/pattern-builder' {
  import { FC } from 'react';

  export interface PatternBuilderProps {
    showYamlPreview?: boolean;
    onSave?: (yaml: string) => void;
    onChange?: () => void;
  }

  export const PatternBuilder: FC<PatternBuilderProps>;
}
