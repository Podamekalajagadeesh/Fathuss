{{/*
Generic service deployment template
*/}}
{{- define "fathuss.serviceDeployment" -}}
{{- $serviceName := index . "serviceName" -}}
{{- $serviceValues := index . "serviceValues" -}}
{{- if $serviceValues.enabled }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "fathuss.fullname" $ }}-{{ $serviceName }}
  labels:
    {{- include "fathuss.labels" $ | nindent 4 }}
    app.kubernetes.io/component: {{ $serviceName }}
spec:
  replicas: {{ $serviceValues.replicaCount }}
  selector:
    matchLabels:
      {{- include "fathuss.selectorLabels" $ | nindent 6 }}
      app.kubernetes.io/component: {{ $serviceName }}
  template:
    metadata:
      labels:
        {{- include "fathuss.selectorLabels" $ | nindent 8 }}
        app.kubernetes.io/component: {{ $serviceName }}
    spec:
      containers:
        - name: {{ $serviceName }}
          image: {{ $serviceValues.image.repository }}:{{ $serviceValues.image.tag | default $.Chart.AppVersion }}
          imagePullPolicy: {{ $serviceValues.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ $serviceValues.service.port }}
              protocol: TCP
          env:
            {{- range $serviceValues.env }}
            - name: {{ .name }}
              {{- if .value }}
              value: {{ .value | quote }}
              {{- else if .valueFrom }}
              valueFrom:
                {{- .valueFrom | toYaml | nindent 16 }}
              {{- end }}
            {{- end }}
          resources:
            {{- toYaml $serviceValues.resources | nindent 12 }}
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
      {{- with $.Values.global.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
---
apiVersion: v1
kind: Service
metadata:
  name: {{ include "fathuss.fullname" $ }}-{{ $serviceName }}
  labels:
    {{- include "fathuss.labels" $ | nindent 4 }}
    app.kubernetes.io/component: {{ $serviceName }}
spec:
  type: {{ $serviceValues.service.type }}
  ports:
    - port: {{ $serviceValues.service.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "fathuss.selectorLabels" $ | nindent 4 }}
    app.kubernetes.io/component: {{ $serviceName }}
{{- end }}
{{- end }}