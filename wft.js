/**
 *  // Move a workflow to the first instance of an activty by name
 *  workflowTools.forceWorkflowToStep('change_request', '68aedb33dbe553800bc09c27db961908', 'Change moves to Implement');
 *
 *  
 *  // Move a workflow to a specific instance of an activity by name
 *  workflowTools.forceWorkflowToStep('change_request', '68aedb33dbe553800bc09c27db961908', 'Change moves to Implement', 0);
 *
 * 
 *  // Move a workflow to a specific instance of an activity by name and override the Scratchpage
 *  workflowTools.forceWorkflowToStep('change_request', '68aedb33dbe553800bc09c27db961908', 'Change moves to Implement', 0, {
 *      "key": "value"
 *  });
 *
 * 
 *  // Skip the current step and specify a result
 *  workflowTools.skipCurrentStep('change_request','68aedb33dbe553800bc09c27db961908','Always');
 *
 *
 *  // Skip a specific running activity when multiple activites are executing and specify a result
 *  // Skips the second running activity
 *  workflowTools.skipCurrentStep('change_request','68aedb33dbe553800bc09c27db961908','Always', 1);
 *
 * 
 *  // Clear all running workflows and recreate the workflow
 *	workflowTools.createWorkflow('change_request','68aedb33dbe553800bc09c27db961908','Change Request - Normal'); 
 *
 * 
 *  //  Clear all running workflows and recreate the workflow starting at a certain activity
 *	workflowTools.createWorkflow('change_request','68aedb33dbe553800bc09c27db961908','Change Request - Normal');
 *
 * 
 *  // Clear all running workflows and recreate the workflow starting at a certain activity and override scratchpad
 *  // Starts the first instance of the activity
 *	workflowTools.createWorkflow('change_request','68aedb33dbe553800bc09c27db961908','Change Request - Normal','Change moves to Assess',0, {
 *		"key":"value"
 *	});
 *	
 */

var workflowTools = {

    createWorkflow: function(table, id, workflow, stepName, index, scratchpad) {
        this.deleteExistingWorkflows(table, id);
        var context = this.createContext(table, id, workflow);

        if (context) {
            if (typeof stepName === 'undefined')
                stepName = 'Begin';

            this.createStepExecution(context, stepName, index, scratchpad);
            this.nudgeWorkflow(context);
        }
    },

    skipCurrentStep: function(table, id, result, index) {
        var context = this.getContext(table, id);
        if (context) {
            var currentStep = this.getCurrentStep(context, index);
            if (currentStep) {
                var nextStep = this.getNextStep(currentStep, result);
                if (nextStep) {
                    this.pauseWorkflow(context);
                    this.createStepExecution(context, nextStep);
                    this.unpauseWorkflow(context);
                    this.nudgeWorkflow(context);

                }

            }
        }
    },

    forceWorkflowToStep: function(table, id, stepName, index, scratchpad) {
        var context = this.getContext(table, id);
        if (context) {
            this.pauseWorkflow(context);
            this.cleanWorkflowChildren(context);
            this.createStepExecution(context, stepName, index, scratchpad);
            this.unpauseWorkflow(context);
            this.nudgeWorkflow(context);
        }

    },

    nudgeWorkflow: function(context) {
        new Workflow().broadcastEvent(context.sys_id, 'update');
    },

    createContext: function(table, id, workflow) {
        var workflowVersion = this.getWorkflowVersionByName(workflow);
        var workflow = this.getWorkflowByName(workflow);

        var context = new GlideRecord('wf_context');

        context.table = table;
        context.id = id;
        context.name = workflowVersion.getDisplayValue();
        context.column_renderer = 'a56213111b030100adca1e094f0713ac';
        context.workflow = workflow.sys_id;
        context.workflow_version = workflowVersion.sys_id;
        context.started = new GlideDateTime();

        var id = context.insert();

        if (id) {
            return context;
        } else {
            return false;
        }
    },

    getNextStep: function(step, result) {
        var transition = new GlideRecord('wf_transition');
        transition.addQuery('from', step.sys_id);
        transition.addQuery('condition.name', result);
        transition.query();

        if (transition.next()) {
            var activity = new GlideRecord('wf_activity');
            activity.get(transition.to.sys_id);

            return activity;
        }

        return false;
    },

    getCurrentStep: function(context, index) {
        if (typeof index === 'undefined') index = 0;

        var rec = new GlideRecord('wf_executing');
        rec.addQuery('context', context.sys_id);
        rec.query();
        var count = 0;

        while (rec.next()) {
            if (count === index) {
                var activity = new GlideRecord('wf_activity');
                activity.get(rec.activity.sys_id);

                return activity;

            }

            count++;
        }

        return false;
    },

    getContext: function(table, id) {
        var context = new GlideRecord('wf_context');
        context.addQuery('table', table);
        context.addQuery('id', id);
        context.query();

        if (context.next()) {
            return context;
        }

        return false;
    },

    createStepExecution: function(context, step, index, scratchpad) {
        if (typeof step === 'string') {
            step = this.getWorkflowStepByName(context.workflow_version.getDisplayValue(), step, index);
        }
        var rec = new GlideRecord('wf_executing');
        rec.context = context.sys_id;
        rec.activity = step.sys_id;
        rec.state = 'executing';
        rec.started = new GlideDateTime();
        rec.scratchpad = JSON.stringify(scratchpad);
        rec.insert();

    },

    pauseWorkflow: function(context) {
        context.state = 'cancelled';
        context.update();

    },

    cleanWorkflowChildren: function(context) {
        this.deleteActivity(context.sys_id);
        this.deleteExecuting(context.sys_id);
        this.deleteTransitions(context.sys_id);
        this.deleteLog(context.sys_id);

    },

    unpauseWorkflow: function(context) {
        context.state = 'executing';
        context.update();
    },

    getWorkflowStepByName: function(workflow, step, index) {
        var workflowVersion;

        if (typeof index === 'undefined') index = 0;

        if (typeof workflow === 'string') {
            workflowVersion = this.getWorkflowVersionByName(workflow);
        }

        var activities = new GlideRecord('wf_activity');
        activities.addQuery('workflow_version', workflowVersion.sys_id);
        activities.addQuery('name', step);
        activities.query();
        var count = 0;

        while (activities.next()) {
            if (count === index) {
                var activity = new GlideRecord('wf_activity');
                activity.get(activities.sys_id);
                return activity;
            }
            count++;
        }

        return false;
    },

    getWorkflowVersionByName: function(name) {
        var context = new GlideRecord('wf_workflow_version');
        context.addQuery('name', name);
        context.addQuery('published', true);
        context.query();

        if (context.next()) {
            return context;
        }
    },

    getWorkflowByName: function(name) {
        var wf = new GlideRecord('wf_workflow');
        wf.addQuery('name', name);
        wf.query();

        if (wf.next()) {
            return wf;
        }
    },

    deleteExistingWorkflows: function(table, id) {
        var context = new GlideRecord('wf_context');
        context.addQuery('table', table);
        context.addQuery('id', id);
        context.query();

        if (context.next()) {
            context.state = 'cancelled';
            context.update();

            this.deleteActivity(context.sys_id);
            this.deleteExecuting(context.sys_id);
            this.deleteTransitions(context.sys_id);
            this.deleteLog(context.sys_id);
            // context.setWorkflow(false);
            context.deleteRecord();
        }
    },

    deleteActivity: function(contextId) {
        var rec = new GlideRecord('wf_history');
        rec.addQuery('context', contextId);
        rec.query();
        rec.setWorkflow(false);
        rec.deleteMultiple();
    },

    deleteExecuting: function(contextId) {
        var rec = new GlideRecord('wf_executing');
        rec.addQuery('context', contextId);
        rec.query();
        rec.setWorkflow(false);
        rec.deleteMultiple();

    },

    deleteTransitions: function(contextId) {
        var rec = new GlideRecord('wf_transition_history');
        rec.addQuery('context', contextId);
        rec.query();
        rec.setWorkflow(false);
        rec.deleteMultiple();
    },

    deleteLog: function(contextId) {
        var rec = new GlideRecord('wf_log');
        rec.addQuery('context', contextId);
        rec.query();
        rec.setWorkflow(false);
        rec.deleteMultiple();
    }
};