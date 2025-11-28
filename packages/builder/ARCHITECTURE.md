# Architecture du Builder RilayKit

> Une architecture minimaliste qui suit les principes fondamentaux de Rilay : DRY, YAGNI, immutabilité, et élégance.

## 🎯 Philosophie

### Principes de Base

1. **DRY** : Réutiliser `form` et `flow` builders existants - zéro duplication
2. **YAGNI** : Implémenter seulement ce qui est nécessaire maintenant
3. **Immutabilité** : Toutes les opérations retournent de nouvelles instances
4. **Type-Safety** : Typage fort avec inférence TypeScript
5. **Separation of Concerns** : Chaque module a une responsabilité unique
6. **API Chainable** : Builder pattern cohérent avec le reste de Rilay
7. **Configuration Déclarative** : Tout est configuré, rien n'est impératif
8. **Découverte Automatique** : Les composants sont autodiscovered depuis `ril`

## 📦 Structure Modulaire

```
@rilaykit/builder/
├── src/
│   ├── builders/                    # Builder pattern (comme form.ts, flow.ts)
│   │   └── visual-builder.ts        # Builder principal
│   │
│   ├── components/                  # Composants React
│   │   ├── FormBuilder/             # Builder visuel de forms
│   │   │   ├── FormBuilder.tsx      # Composant principal
│   │   │   ├── ComponentPalette.tsx # Palette de composants
│   │   │   ├── FormCanvas.tsx       # Zone d'édition drag & drop
│   │   │   └── PropertyPanel.tsx    # Panneau de propriétés
│   │   │
│   │   ├── shared/                  # Composants partagés
│   │   │   ├── DragDropProvider.tsx # Context drag & drop
│   │   │   └── PreviewFrame.tsx     # Preview live
│   │   │
│   │   └── editors/                 # Éditeurs de propriétés
│   │       ├── TextEditor.tsx
│   │       ├── SelectEditor.tsx
│   │       ├── JsonEditor.tsx
│   │       └── registry.ts          # Registry extensible
│   │
│   ├── hooks/                       # Hooks React
│   │   ├── useBuilderState.ts       # État du builder (immutable)
│   │   ├── useDragDrop.ts           # Logique drag & drop
│   │   └── usePropertyEditor.ts     # Gestion des propriétés
│   │
│   ├── utils/                       # Utilitaires purs
│   │   ├── serialization.ts         # JSON ↔ Config
│   │   ├── export.ts                # Export vers code
│   │   └── builder-helpers.ts       # Helpers génériques
│   │
│   ├── types/                       # Types TypeScript
│   │   └── index.ts
│   │
│   └── index.ts                     # Public API
│
└── tests/                           # Tests unitaires & intégration
```

## 🏗️ Architecture en Couches

### Couche 1 : Core Builder (Pure Logic)

**Responsabilité** : Logique métier pure, sans React

```typescript
// visual-builder.ts
export class visualBuilder<C extends Record<string, any>> {
  private formBuilder: form<C>;
  private rilConfig: ril<C>;
  private history: HistoryStack;
  
  static create<Cm extends Record<string, any>>(
    rilConfig: ril<Cm>
  ): visualBuilder<Cm> {
    return new visualBuilder(rilConfig);
  }
  
  // Méthodes immutables
  addComponent(type: string): visualBuilder<C> { /* ... */ }
  removeComponent(id: string): visualBuilder<C> { /* ... */ }
  updateComponent(id: string, props: any): visualBuilder<C> { /* ... */ }
  moveComponent(id: string, position: number): visualBuilder<C> { /* ... */ }
  
  // Undo/Redo immutable
  undo(): visualBuilder<C> { /* ... */ }
  redo(): visualBuilder<C> { /* ... */ }
  
  // Export/Import
  toJSON(): SerializedBuilder { /* ... */ }
  fromJSON(json: SerializedBuilder): visualBuilder<C> { /* ... */ }
  
  // Build final
  build(): FormConfiguration<C> {
    return this.formBuilder.build();
  }
}
```

**Principe** : Comme `form` et `flow`, le builder est une classe pure qui retourne toujours de nouvelles instances.

### Couche 2 : React Integration (UI Layer)

**Responsabilité** : Composants React qui utilisent le core builder

```typescript
// FormBuilder.tsx
interface FormBuilderProps {
  rilConfig: ril<any>;
  initialBuilder?: visualBuilder<any>;
  onSave?: (config: FormConfiguration) => void;
}

export const FormBuilder: React.FC<FormBuilderProps> = ({
  rilConfig,
  initialBuilder,
  onSave,
}) => {
  const [builder, setBuilder] = useState(() => 
    initialBuilder || visualBuilder.create(rilConfig)
  );
  
  const handleAddComponent = (type: string) => {
    setBuilder(builder.addComponent(type));
  };
  
  const handleSave = () => {
    onSave?.(builder.build());
  };
  
  return (
    <DragDropProvider>
      <div className="rilay-builder">
        <ComponentPalette 
          components={rilConfig.getAllComponents()}
          onSelect={handleAddComponent}
        />
        <FormCanvas 
          builder={builder}
          onChange={setBuilder}
        />
        <PropertyPanel 
          builder={builder}
          onChange={setBuilder}
        />
      </div>
    </DragDropProvider>
  );
};
```

**Principe** : Les composants React sont des wrappers autour du builder, ils ne contiennent pas de logique métier.

### Couche 3 : Property Editors (Extensible)

**Responsabilité** : Système d'éditeurs de propriétés extensible

```typescript
// editors/registry.ts
type PropertyEditorComponent = React.FC<PropertyEditorProps<any>>;

class PropertyEditorRegistry {
  private editors = new Map<string, PropertyEditorComponent>();
  
  register(type: string, editor: PropertyEditorComponent): void {
    this.editors.set(type, editor);
  }
  
  get(type: string): PropertyEditorComponent | undefined {
    return this.editors.get(type);
  }
  
  // Éditeurs par défaut
  static createDefault(): PropertyEditorRegistry {
    const registry = new PropertyEditorRegistry();
    registry.register('text', TextEditor);
    registry.register('number', NumberEditor);
    registry.register('boolean', BooleanEditor);
    registry.register('select', SelectEditor);
    registry.register('json', JsonEditor);
    return registry;
  }
}

export const defaultEditorRegistry = PropertyEditorRegistry.createDefault();

// Utilisation
<PropertyEditor
  definition={propDef}
  value={value}
  onChange={onChange}
  registry={customRegistry || defaultEditorRegistry}
/>
```

**Principe** : Système de registry extensible pour ajouter des éditeurs custom sans modifier le core.

## 🔄 Flux de Données (Immutable)

```
┌─────────────────────────────────────────────────────────────┐
│                         USER ACTION                          │
│              (drag component, edit property)                 │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      EVENT HANDLER                           │
│         (handleAddComponent, handleUpdateProperty)           │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    BUILDER METHOD CALL                       │
│              builder.addComponent(type)                      │
│              ↓ (returns new instance)                        │
│              newBuilder = visualBuilder<C>                   │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    INTERNAL MUTATION                         │
│         newBuilder.formBuilder.add(...)                      │
│         newBuilder.history.push(action)                      │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    STATE UPDATE (React)                      │
│              setBuilder(newBuilder)                          │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                         RE-RENDER                            │
│          UI reflects new builder state                       │
└─────────────────────────────────────────────────────────────┘
```

**Principe** : Immutabilité complète - chaque action crée une nouvelle instance.

## 🎨 API Publique Minimaliste

### Création Simple

```typescript
import { FormBuilder } from '@rilaykit/builder';
import { ril } from '@rilaykit/core';

// Configuration minimale
const rilConfig = ril.create()
  .addComponent('text', { 
    name: 'Text', 
    renderer: TextInput 
  });

// Utilisation directe
<FormBuilder 
  rilConfig={rilConfig}
  onSave={(config) => console.log(config)}
/>
```

### Avec État Contrôlé (Advanced)

```typescript
import { visualBuilder, FormBuilder } from '@rilaykit/builder';

function MyApp() {
  const [builder, setBuilder] = useState(() => 
    visualBuilder.create(rilConfig)
  );
  
  return (
    <FormBuilder
      rilConfig={rilConfig}
      builder={builder}
      onChange={setBuilder}
      onSave={(config) => api.save(config)}
    />
  );
}
```

### Export Programmatique

```typescript
import { visualBuilder, exportBuilder } from '@rilaykit/builder';

const builder = visualBuilder.create(rilConfig)
  .addComponent('text')
  .addComponent('email')
  .build();

// Export JSON
const json = builder.toJSON();

// Export TypeScript
const code = exportBuilder(json, {
  format: 'typescript',
  includeComments: true,
});
```

## 🔌 Extensibilité

### Custom Property Editors

```typescript
import { PropertyEditorRegistry } from '@rilaykit/builder';

// Créer un éditeur custom
const LocationEditor: React.FC<PropertyEditorProps<Location>> = ({
  value,
  onChange,
  definition,
}) => {
  // Votre UI custom
  return <LocationPicker value={value} onChange={onChange} />;
};

// Enregistrer
const customRegistry = PropertyEditorRegistry.createDefault();
customRegistry.register('location', LocationEditor);

// Utiliser
<FormBuilder
  rilConfig={rilConfig}
  editorRegistry={customRegistry}
/>
```

### Custom Component Discovery

```typescript
// Les composants avec builder metadata sont autodiscovered
rilConfig.addComponent('location', {
  name: 'Location',
  renderer: LocationInput,
  builder: {
    category: 'Advanced',
    icon: 'map-pin',
    editableProps: [
      {
        key: 'granularity',
        label: 'Granularity',
        editorType: 'location-granularity', // Custom editor
        customEditor: LocationGranularityEditor,
      }
    ]
  }
});

// Automatiquement disponible dans le builder
```

## 📊 État et Historique (Immutable)

```typescript
interface BuilderState {
  readonly current: visualBuilder<any>;
  readonly history: {
    readonly past: visualBuilder<any>[];
    readonly future: visualBuilder<any>[];
    readonly canUndo: boolean;
    readonly canRedo: boolean;
  };
}

// Hook d'utilisation
function useBuilderWithHistory(initialBuilder: visualBuilder<any>) {
  const [state, setState] = useState<BuilderState>({
    current: initialBuilder,
    history: {
      past: [],
      future: [],
      canUndo: false,
      canRedo: false,
    },
  });
  
  const update = (newBuilder: visualBuilder<any>) => {
    setState({
      current: newBuilder,
      history: {
        past: [...state.history.past, state.current],
        future: [],
        canUndo: true,
        canRedo: false,
      },
    });
  };
  
  const undo = () => {
    if (!state.history.canUndo) return;
    
    const previous = state.history.past[state.history.past.length - 1];
    setState({
      current: previous,
      history: {
        past: state.history.past.slice(0, -1),
        future: [state.current, ...state.history.future],
        canUndo: state.history.past.length > 1,
        canRedo: true,
      },
    });
  };
  
  return { builder: state.current, update, undo, redo, history: state.history };
}
```

**Principe** : Historique immutable avec undo/redo sans mutation.

## 🎯 Avantages de cette Architecture

### ✅ Respecte la Philosophie Rilay

1. **DRY** : Réutilise `form` et `flow` builders - zéro duplication de code
2. **YAGNI** : Implémente seulement ce qui est nécessaire (MVP fonctionnel)
3. **Immutable** : Toutes les opérations sont immutables
4. **Type-Safe** : Inférence de types complète
5. **Chainable** : API cohérente avec `ril`, `form`, `flow`

### ✅ Extensible Sans Over-Engineering

- Property editors registry extensible
- Custom editors via `customEditor` prop
- Découverte automatique avec fallback intelligent
- Pas de framework lourd, juste React + @dnd-kit

### ✅ Testable

- Core builder est pur (pas de React) → tests unitaires faciles
- Composants React sont des wrappers → tests d'intégration
- Mock du `ril` config → tests isolés

### ✅ Performance

- Immutabilité → React.memo et useMemo efficaces
- Pas de re-render inutiles
- Lazy loading possible pour les éditeurs custom

### ✅ Developer Experience

- API simple et intuitive
- Autocomplete TypeScript
- Erreurs claires
- Documentation inline

## 🚀 Implémentation Progressive

### Phase 1 : MVP (YAGNI)

```
✅ Core Builder (visualBuilder class)
✅ Basic React Components (FormBuilder, Palette, Canvas)
✅ Default Property Editors (text, number, boolean, select)
✅ Drag & Drop de base
✅ Export/Import JSON
```

### Phase 2 : Si Nécessaire

```
🔄 Workflow Builder (réutilise flow builder)
🔄 Advanced Editors (JSON, custom)
🔄 Undo/Redo UI
🔄 Export TypeScript/JavaScript
🔄 Templates
```

### Phase 3 : Si Vraiment Nécessaire

```
📦 Persistance (localStorage, API)
📦 Collaboration (WebSocket, CRDT)
📦 Plugin System
📦 Marketplace
```

## 📝 Exemple Complet d'Utilisation

```typescript
import { ril } from '@rilaykit/core';
import { visualBuilder, FormBuilder } from '@rilaykit/builder';

// 1. Créer la config Rilay
const rilConfig = ril.create()
  .addComponent('text', {
    name: 'Text Input',
    renderer: TextInput,
    builder: {
      category: 'Inputs',
      icon: 'text',
      editableProps: [
        { key: 'label', label: 'Label', editorType: 'text' },
        { key: 'placeholder', label: 'Placeholder', editorType: 'text' },
      ]
    }
  })
  .addComponent('email', {
    name: 'Email',
    renderer: EmailInput,
    builder: {
      category: 'Inputs',
      icon: 'mail',
      editableProps: [
        { key: 'label', label: 'Label', editorType: 'text' },
        { key: 'required', label: 'Required', editorType: 'boolean' },
      ]
    }
  });

// 2. Utiliser le builder visuel
function App() {
  return (
    <FormBuilder
      rilConfig={rilConfig}
      onSave={(config) => {
        // Config est un FormConfiguration standard
        // Peut être utilisé directement avec <Form config={config} />
        console.log('Form saved:', config);
      }}
    />
  );
}

// 3. Ou programmatiquement
const builder = visualBuilder.create(rilConfig)
  .addComponent('text')
  .addComponent('email')
  .build();

// Résultat : FormConfiguration prêt à l'emploi
<Form config={builder} onSubmit={handleSubmit} />
```

---

## 🎓 Résumé de la Philosophie

Cette architecture est **Rilay** car elle :

1. **Ne réinvente rien** - Réutilise form/flow builders
2. **API cohérente** - Suit le pattern builder existant
3. **Type-safe** - Inférence TypeScript complète
4. **Immutable** - Pas de mutation d'état
5. **Modulaire** - Chaque couche a sa responsabilité
6. **Extensible** - Registry system sans over-engineering
7. **YAGNI** - MVP fonctionnel, extensions si nécessaire
8. **DRY** - Zéro duplication de code
9. **Testable** - Séparation logique/UI
10. **Developer-friendly** - API simple et intuitive

C'est du **Rilay pur** : élégant, minimal, puissant. 🚀

