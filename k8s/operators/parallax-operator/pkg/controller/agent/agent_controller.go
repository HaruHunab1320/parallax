package agent

import (
	"context"
	"fmt"

	agentv1alpha1 "github.com/parallax/parallax-operator/pkg/apis/agent/v1alpha1"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/intstr"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"
)

// AgentReconciler reconciles a ParallaxAgent object
type AgentReconciler struct {
	client.Client
	Scheme *runtime.Scheme
}

// +kubebuilder:rbac:groups=agent.parallax.io,resources=parallaxagents,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=agent.parallax.io,resources=parallaxagents/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=core,resources=services,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=core,resources=configmaps,verbs=get;list;watch

// Reconcile reads the state of the cluster for a ParallaxAgent object and makes changes
func (r *AgentReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := log.FromContext(ctx)

	// Fetch the ParallaxAgent instance
	agent := &agentv1alpha1.ParallaxAgent{}
	err := r.Get(ctx, req.NamespacedName, agent)
	if err != nil {
		if errors.IsNotFound(err) {
			// Request object not found, could have been deleted after reconcile request
			return reconcile.Result{}, nil
		}
		return reconcile.Result{}, err
	}

	// Set default values
	if agent.Spec.Replicas == nil {
		replicas := int32(1)
		agent.Spec.Replicas = &replicas
	}

	// Reconcile Deployment
	deployment := r.deploymentForAgent(agent)
	if err := controllerutil.SetControllerReference(agent, deployment, r.Scheme); err != nil {
		return reconcile.Result{}, err
	}

	foundDeployment := &appsv1.Deployment{}
	err = r.Get(ctx, types.NamespacedName{Name: deployment.Name, Namespace: deployment.Namespace}, foundDeployment)
	if err != nil && errors.IsNotFound(err) {
		log.Info("Creating Deployment", "deployment", deployment.Name)
		err = r.Create(ctx, deployment)
		if err != nil {
			return reconcile.Result{}, err
		}
	} else if err != nil {
		return reconcile.Result{}, err
	} else {
		// Update deployment if needed
		if *foundDeployment.Spec.Replicas != *agent.Spec.Replicas {
			foundDeployment.Spec.Replicas = agent.Spec.Replicas
			err = r.Update(ctx, foundDeployment)
			if err != nil {
				return reconcile.Result{}, err
			}
		}
	}

	// Reconcile Service
	service := r.serviceForAgent(agent)
	if err := controllerutil.SetControllerReference(agent, service, r.Scheme); err != nil {
		return reconcile.Result{}, err
	}

	foundService := &corev1.Service{}
	err = r.Get(ctx, types.NamespacedName{Name: service.Name, Namespace: service.Namespace}, foundService)
	if err != nil && errors.IsNotFound(err) {
		log.Info("Creating Service", "service", service.Name)
		err = r.Create(ctx, service)
		if err != nil {
			return reconcile.Result{}, err
		}
	} else if err != nil {
		return reconcile.Result{}, err
	}

	// Update status
	agent.Status.Phase = agentv1alpha1.AgentRunning
	agent.Status.Replicas = *agent.Spec.Replicas
	agent.Status.Endpoint = fmt.Sprintf("%s.%s.svc.cluster.local:%d", 
		service.Name, service.Namespace, agent.Spec.Port)

	// Get deployment status
	deployment = &appsv1.Deployment{}
	err = r.Get(ctx, types.NamespacedName{
		Name:      agent.Name + "-deployment",
		Namespace: agent.Namespace,
	}, deployment)
	if err == nil {
		agent.Status.AvailableReplicas = deployment.Status.AvailableReplicas
	}

	err = r.Status().Update(ctx, agent)
	if err != nil {
		log.Error(err, "Failed to update agent status")
		return reconcile.Result{}, err
	}

	return reconcile.Result{}, nil
}

// deploymentForAgent returns a Deployment object for the agent
func (r *AgentReconciler) deploymentForAgent(agent *agentv1alpha1.ParallaxAgent) *appsv1.Deployment {
	labels := map[string]string{
		"app":        "parallax-agent",
		"agent":      agent.Name,
		"agent-type": agent.Spec.AgentID,
	}

	// Add capabilities as labels
	for _, cap := range agent.Spec.Capabilities {
		labels["capability-"+cap] = "true"
	}

	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      agent.Name + "-deployment",
			Namespace: agent.Namespace,
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: agent.Spec.Replicas,
			Selector: &metav1.LabelSelector{
				MatchLabels: labels,
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: labels,
				},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "agent",
							Image: agent.Spec.Image,
							Ports: []corev1.ContainerPort{
								{
									Name:          "grpc",
									ContainerPort: agent.Spec.Port,
									Protocol:      corev1.ProtocolTCP,
								},
							},
							Env: append(agent.Spec.Env, 
								corev1.EnvVar{
									Name:  "AGENT_ID",
									Value: agent.Spec.AgentID,
								},
								corev1.EnvVar{
									Name:  "AGENT_PORT",
									Value: fmt.Sprintf("%d", agent.Spec.Port),
								},
								corev1.EnvVar{
									Name:  "PARALLAX_REGISTRY",
									Value: "parallax-control-plane:2379",
								},
							),
							Resources: agent.Spec.Resources,
						},
					},
				},
			},
		},
	}

	// Add health check if enabled
	if agent.Spec.HealthCheck != nil && agent.Spec.HealthCheck.Enabled {
		deployment.Spec.Template.Spec.Containers[0].LivenessProbe = &corev1.Probe{
			ProbeHandler: corev1.ProbeHandler{
				HTTPGet: &corev1.HTTPGetAction{
					Path: agent.Spec.HealthCheck.Path,
					Port: intstr.FromInt(int(agent.Spec.Port)),
				},
			},
			PeriodSeconds: 30,
		}
		deployment.Spec.Template.Spec.Containers[0].ReadinessProbe = &corev1.Probe{
			ProbeHandler: corev1.ProbeHandler{
				HTTPGet: &corev1.HTTPGetAction{
					Path: agent.Spec.HealthCheck.Path,
					Port: intstr.FromInt(int(agent.Spec.Port)),
				},
			},
			PeriodSeconds: 10,
		}
	}

	return deployment
}

// serviceForAgent returns a Service object for the agent
func (r *AgentReconciler) serviceForAgent(agent *agentv1alpha1.ParallaxAgent) *corev1.Service {
	labels := map[string]string{
		"app":   "parallax-agent",
		"agent": agent.Name,
	}

	return &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      agent.Name + "-service",
			Namespace: agent.Namespace,
			Labels:    labels,
		},
		Spec: corev1.ServiceSpec{
			Selector: labels,
			Ports: []corev1.ServicePort{
				{
					Name:       "grpc",
					Port:       agent.Spec.Port,
					TargetPort: intstr.FromInt(int(agent.Spec.Port)),
					Protocol:   corev1.ProtocolTCP,
				},
			},
			Type: corev1.ServiceTypeClusterIP,
		},
	}
}

// SetupWithManager sets up the controller with the Manager
func (r *AgentReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&agentv1alpha1.ParallaxAgent{}).
		Owns(&appsv1.Deployment{}).
		Owns(&corev1.Service{}).
		Complete(r)
}