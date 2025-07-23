import { ril } from '@rilaykit/core';
import { when } from '@rilaykit/core/src/conditions';
import { form } from '@rilaykit/forms';
import { flow } from '../../src/builders/flow';

describe('Workflow Conditions', () => {
  let rilConfig: ril;
  let basicForm: any;

  beforeEach(() => {
    rilConfig = ril
      .create()
      .addComponent('text', {
        name: 'Text Input',
        renderer: () => null,
        defaultProps: { placeholder: '' },
      })
      .addComponent('select', {
        name: 'Select',
        renderer: () => null,
        defaultProps: { options: [] },
      });

    // Create a basic form for testing
    basicForm = form
      .create(rilConfig, 'basic-form')
      .add({
        type: 'text',
        props: { label: 'Basic Field' },
      })
      .build();
  });

  test('should add conditions to step during creation', () => {
    const workflow = flow
      .create(rilConfig, 'test-workflow', 'Test Workflow')
      .addStep({
        id: 'personalInfo',
        title: 'Personal Information',
        formConfig: basicForm,
      })
      .addStep({
        id: 'paymentStep',
        title: 'Payment Information',
        formConfig: basicForm,
        conditions: {
          visible: when('personalInfo.isPremium').equals(true).build(),
          disabled: when('personalInfo.balance').equals(0).build(),
        },
      });

    const workflowConfig = workflow.build();
    const paymentStep = workflowConfig.steps.find((s) => s.id === 'paymentStep');

    expect(paymentStep?.conditions).toBeDefined();
    expect(paymentStep?.conditions?.visible).toBeDefined();
    expect(paymentStep?.conditions?.disabled).toBeDefined();
    expect(paymentStep?.conditions?.visible?.field).toBe('personalInfo.isPremium');
    expect(paymentStep?.conditions?.visible?.operator).toBe('equals');
    expect(paymentStep?.conditions?.visible?.value).toBe(true);
  });

  test('should add conditions to existing step', () => {
    const workflow = flow
      .create(rilConfig, 'test-workflow', 'Test Workflow')
      .addStep({
        id: 'basicInfo',
        title: 'Basic Information',
        formConfig: basicForm,
      })
      .addStep({
        id: 'advancedStep',
        title: 'Advanced Configuration',
        formConfig: basicForm,
      });

    workflow.addStepConditions('advancedStep', {
      visible: when('basicInfo.userType').equals('advanced').build(),
      required: when('basicInfo.userType').equals('advanced').build(),
    });

    const workflowConfig = workflow.build();
    const advancedStep = workflowConfig.steps.find((s) => s.id === 'advancedStep');

    expect(advancedStep?.conditions).toBeDefined();
    expect(advancedStep?.conditions?.visible).toBeDefined();
    expect(advancedStep?.conditions?.required).toBeDefined();
  });

  test('should merge conditions when adding to existing step conditions', () => {
    const workflow = flow.create(rilConfig, 'test-workflow', 'Test Workflow').addStep({
      id: 'step1',
      title: 'Step 1',
      formConfig: basicForm,
      conditions: {
        visible: when('other').exists().build(),
      },
    });

    workflow.addStepConditions('step1', {
      disabled: when('other').equals('disabled').build(),
    });

    const workflowConfig = workflow.build();
    const step = workflowConfig.steps.find((s) => s.id === 'step1');

    expect(step?.conditions?.visible).toBeDefined();
    expect(step?.conditions?.disabled).toBeDefined();
  });

  test('should handle complex step conditional logic', () => {
    const workflow = flow
      .create(rilConfig, 'test-workflow', 'Test Workflow')
      .addStep({
        id: 'userInfo',
        title: 'User Information',
        formConfig: basicForm,
      })
      .addStep({
        id: 'conditionalStep',
        title: 'Conditional Step',
        formConfig: basicForm,
        conditions: {
          visible: when('userInfo.age')
            .greaterThan(18)
            .and(when('userInfo.country').equals('US'))
            .or(when('userInfo.hasPermission').equals(true))
            .build(),
        },
      });

    const workflowConfig = workflow.build();
    const conditionalStep = workflowConfig.steps.find((s) => s.id === 'conditionalStep');

    expect(conditionalStep?.conditions?.visible).toBeDefined();
    expect(conditionalStep?.conditions?.visible?.conditions).toBeDefined();
    expect(conditionalStep?.conditions?.visible?.conditions?.length).toBeGreaterThan(0);
  });

  test('should throw error when adding conditions to non-existent step', () => {
    const workflow = flow.create(rilConfig, 'test-workflow', 'Test Workflow').addStep({
      title: 'Basic Step',
      formConfig: basicForm,
    });

    expect(() => {
      workflow.addStepConditions('nonExistentStep', {
        visible: when('other').exists().build(),
      });
    }).toThrow('Step with ID "nonExistentStep" not found');
  });

  test('should allow multiple steps with different conditions', () => {
    const workflow = flow
      .create(rilConfig, 'test-workflow', 'Test Workflow')
      .addStep({
        id: 'step1',
        title: 'Step 1',
        formConfig: basicForm,
      })
      .addStep({
        id: 'step2',
        title: 'Step 2',
        formConfig: basicForm,
        conditions: {
          visible: when('step1.field1').exists().build(),
        },
      })
      .addStep({
        id: 'step3',
        title: 'Step 3',
        formConfig: basicForm,
        conditions: {
          visible: when('step1.field1').equals('showStep3').build(),
        },
      });

    const workflowConfig = workflow.build();

    expect(workflowConfig.steps).toHaveLength(3);
    expect(workflowConfig.steps[0].conditions).toBeUndefined();
    expect(workflowConfig.steps[1].conditions?.visible).toBeDefined();
    expect(workflowConfig.steps[2].conditions?.visible).toBeDefined();
  });
});
