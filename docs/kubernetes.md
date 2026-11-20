# Kubernetes on the deck

Open **Apps → Kubernetes → Edit connection** to create or open the local `kubernetes.json` file. Set the full path to the installed Windows `kubectl.exe` and list the contexts and namespaces you want on the deck.

```json
{
  "version": 1,
  "executable": "C:\\Programs\\Kubernetes\\kubectl.exe",
  "kubeconfig": "C:\\Users\\you\\.kube\\config",
  "logs": false,
  "targets": [
    {
      "id": "staging",
      "label": "Staging",
      "context": "developer-staging",
      "namespace": "my-app"
    }
  ]
}
```

You can omit `kubeconfig` to use kubectl's normal Windows configuration. Use a trusted kubeconfig and an account with permission to list pods and deployments in each selected namespace. The target picker supports up to 12 entries. Lastra only queries the selected target while this view is open, with an automatic refresh every 15 seconds after each sample finishes.

Set `logs` to `true` to show a **Logs** button on the pod rows. The account also needs permission to get the selected pod and read its logs. Lastra shows up to 80 lines and 8 KB of recent output for one explicitly selected container. It checks the pod identity before and after the read, displays the output locally and clears it when you close the log, switch targets or leave the view.
