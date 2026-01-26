{{/*
Expand the name of the chart.
*/}}
{{- define "parallax.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "parallax.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "parallax.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "parallax.labels" -}}
helm.sh/chart: {{ include "parallax.chart" . }}
{{ include "parallax.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "parallax.selectorLabels" -}}
app.kubernetes.io/name: {{ include "parallax.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "parallax.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "parallax.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Control plane labels
*/}}
{{- define "parallax.controlPlane.labels" -}}
{{ include "parallax.labels" . }}
app.kubernetes.io/component: control-plane
{{- end }}

{{/*
Operator labels
*/}}
{{- define "parallax.operator.labels" -}}
{{ include "parallax.labels" . }}
app.kubernetes.io/component: operator
{{- end }}

{{/*
Namespace
*/}}
{{- define "parallax.namespace" -}}
{{- default .Release.Namespace .Values.namespaceOverride }}
{{- end }}