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
      annotations:
        {{- if $serviceValues.securityContext }}
        seccomp.security.alpha.kubernetes.io/pod: {{ $serviceValues.securityContext.seccompProfile | default "runtime/default" }}
        {{- if $serviceValues.securityContext.appArmorProfile }}
        container.apparmor.security.beta.kubernetes.io/{{ $serviceName }}: {{ $serviceValues.securityContext.appArmorProfile }}
        {{- end }}
        {{- end }}
    spec:
      {{- if $serviceValues.securityContext }}
      securityContext:
        runAsUser: {{ $serviceValues.securityContext.runAsUser | default 1000 }}
        runAsGroup: {{ $serviceValues.securityContext.runAsGroup | default 1000 }}
        fsGroup: {{ $serviceValues.securityContext.fsGroup | default 1000 }}
        runAsNonRoot: {{ $serviceValues.securityContext.runAsNonRoot | default true }}
      {{- end }}
      volumes:
        {{- if $serviceValues.securityContext }}
        - name: seccomp-profile
          configMap:
            name: {{ include "fathuss.fullname" $ }}-seccomp-profiles
            items:
            - key: grader-seccomp.json
              path: grader-seccomp.json
        {{- end }}
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
          volumeMounts:
            {{- if $serviceValues.securityContext }}
            - name: seccomp-profile
              mountPath: /var/lib/kubelet/seccomp
              readOnly: true
            {{- end }}
          {{- if $serviceValues.securityContext }}
          securityContext:
            allowPrivilegeEscalation: {{ $serviceValues.securityContext.allowPrivilegeEscalation | default false }}
            readOnlyRootFilesystem: {{ $serviceValues.securityContext.readOnlyRootFilesystem | default true }}
            runAsNonRoot: {{ $serviceValues.securityContext.runAsNonRoot | default true }}
            runAsUser: {{ $serviceValues.securityContext.runAsUser | default 1000 }}
            capabilities:
              drop:
                - ALL
              {{- if $serviceValues.securityContext.capabilities }}
              add:
                {{- $serviceValues.securityContext.capabilities | toYaml | nindent 16 }}
              {{- end }}
          {{- end }}
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