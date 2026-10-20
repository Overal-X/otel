# Formatio extension for the OpenTelemetry Java agent

Formatio's Railpack builds add the [OpenTelemetry Java agent](https://opentelemetry.io/docs/zero-code/java/agent/)
and this extension to Java applications. The agent traces requests and records exceptions on
them; the extension reports an uncaught exception outside a request, a crash at startup among
them, on a span named `uncaught exception`, and waits up to 2 seconds for it to be exported
before the JVM handles the crash as usual.

Use it with the agent anywhere:

```sh
java -javaagent:opentelemetry-javaagent.jar \
  -Dotel.javaagent.extensions=formatio-otel-javaagent-extension.jar -jar app.jar
```

## Build and release

```sh
./mvnw verify   # tests, then target/formatio-otel-javaagent-extension.jar
```

The jar is reproducible. A release is the jar attached to a GitHub release tagged
`java/v<version>`; Formatio pins its SHA-256 next to the agent version it is built for
(`pom.xml`'s `otel.javaagent.version`).
