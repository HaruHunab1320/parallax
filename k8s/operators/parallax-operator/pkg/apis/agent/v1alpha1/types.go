package v1alpha1

import (
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// +genclient
// +k8s:deepcopy-gen:interfaces=k8s.io/apimachinery/pkg/runtime.Object
// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:resource:shortName=pxa
// +kubebuilder:printcolumn:name="Status",type=string,JSONPath=`.status.phase`
// +kubebuilder:printcolumn:name="Replicas",type=integer,JSONPath=`.status.replicas`
// +kubebuilder:printcolumn:name="Available",type=integer,JSONPath=`.status.availableReplicas`
// +kubebuilder:printcolumn:name="Confidence",type=number,JSONPath=`.status.metrics.averageConfidence`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// ParallaxAgent is the Schema for the parallaxagents API
type ParallaxAgent struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   ParallaxAgentSpec   `json:"spec,omitempty"`
	Status ParallaxAgentStatus `json:"status,omitempty"`
}

// ParallaxAgentSpec defines the desired state of ParallaxAgent
type ParallaxAgentSpec struct {
	// AgentID is the unique identifier for the agent
	AgentID string `json:"agentId"`

	// Image is the container image for the agent
	Image string `json:"image"`

	// Replicas is the number of agent replicas
	// +kubebuilder:default=1
	// +kubebuilder:validation:Minimum=1
	Replicas *int32 `json:"replicas,omitempty"`

	// Capabilities is the list of capabilities this agent provides
	Capabilities []string `json:"capabilities"`

	// Resources are the resource requirements
	Resources corev1.ResourceRequirements `json:"resources,omitempty"`

	// Env is the list of environment variables
	Env []corev1.EnvVar `json:"env,omitempty"`

	// Port is the gRPC port for the agent
	// +kubebuilder:default=50051
	Port int32 `json:"port,omitempty"`

	// HealthCheck is the health check configuration
	HealthCheck *HealthCheckConfig `json:"healthCheck,omitempty"`

	// Autoscaling is the autoscaling configuration
	Autoscaling *AutoscalingConfig `json:"autoscaling,omitempty"`
}

// HealthCheckConfig defines health check configuration
type HealthCheckConfig struct {
	// Enabled determines if health checks are enabled
	// +kubebuilder:default=true
	Enabled bool `json:"enabled,omitempty"`

	// Path is the health check endpoint path
	// +kubebuilder:default="/health"
	Path string `json:"path,omitempty"`

	// Interval is the health check interval
	// +kubebuilder:default="30s"
	Interval string `json:"interval,omitempty"`
}

// AutoscalingConfig defines autoscaling configuration
type AutoscalingConfig struct {
	// Enabled determines if autoscaling is enabled
	// +kubebuilder:default=false
	Enabled bool `json:"enabled,omitempty"`

	// MinReplicas is the minimum number of replicas
	// +kubebuilder:default=1
	MinReplicas int32 `json:"minReplicas,omitempty"`

	// MaxReplicas is the maximum number of replicas
	// +kubebuilder:default=10
	MaxReplicas int32 `json:"maxReplicas,omitempty"`

	// TargetCPUUtilizationPercentage is the target CPU utilization
	// +kubebuilder:default=80
	TargetCPUUtilizationPercentage int32 `json:"targetCPUUtilizationPercentage,omitempty"`

	// TargetConfidenceThreshold scales based on confidence metrics
	// +kubebuilder:validation:Minimum=0
	// +kubebuilder:validation:Maximum=1
	TargetConfidenceThreshold *float64 `json:"targetConfidenceThreshold,omitempty"`
}

// ParallaxAgentStatus defines the observed state of ParallaxAgent
type ParallaxAgentStatus struct {
	// Phase is the current phase of the agent
	Phase AgentPhase `json:"phase,omitempty"`

	// Replicas is the current number of replicas
	Replicas int32 `json:"replicas,omitempty"`

	// AvailableReplicas is the number of available replicas
	AvailableReplicas int32 `json:"availableReplicas,omitempty"`

	// Conditions represent the latest available observations
	Conditions []metav1.Condition `json:"conditions,omitempty"`

	// Endpoint is the service endpoint for the agent
	Endpoint string `json:"endpoint,omitempty"`

	// LastSeen is the last time the agent reported to the registry
	LastSeen *metav1.Time `json:"lastSeen,omitempty"`

	// Metrics contains agent performance metrics
	Metrics *AgentMetrics `json:"metrics,omitempty"`
}

// AgentPhase represents the phase of an agent
type AgentPhase string

const (
	AgentPending     AgentPhase = "Pending"
	AgentRunning     AgentPhase = "Running"
	AgentFailed      AgentPhase = "Failed"
	AgentTerminating AgentPhase = "Terminating"
)

// AgentMetrics contains agent performance metrics
type AgentMetrics struct {
	AverageConfidence float64 `json:"averageConfidence,omitempty"`
	TotalRequests     int64   `json:"totalRequests,omitempty"`
	ErrorRate         float64 `json:"errorRate,omitempty"`
}

// +k8s:deepcopy-gen:interfaces=k8s.io/apimachinery/pkg/runtime.Object

// ParallaxAgentList contains a list of ParallaxAgent
type ParallaxAgentList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []ParallaxAgent `json:"items"`
}