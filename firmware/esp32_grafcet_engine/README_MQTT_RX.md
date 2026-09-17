# Especificação de Acionamento Remoto (Componentes Rx via MQTT e Web GUI)

## Visão Geral
No sistema **GrafcetEditor** e no microcontrolador **ESP32 (userver03)**, as variáveis **$R_x$** ($R_1$ a $R_8$) representam **Entradas Remotas do Sistema**.

Diferente das entradas físicas ($I_1$ a $I_8$), que são acionadas por sinais elétricos nos bornes ou pinos GPIO do CLP/ESP32, as entradas $R_x$ são manipuladas de forma assíncrona por:
1. **Interface Gráfica Web / Dashboard IoT**: cliques em botões virtuais, botoeiras de comando remoto ou botões do painel do simulador (Simulation Rack).
2. **Mensagens MQTT**: comandos transmitidos por brokers IoT (Mosquitto, AWS IoT, HiveMQ, etc.) a partir de sistemas supervisórios (SCADA), Node-RED ou nós remotos.

---

## Mapeamento de Memória no Firmware ESP32
No firmware do interpretador de equações booleanas (`userver03`), as entradas remotas são armazenadas em um registrador de 8 bits:
```cpp
// uint8_t remoteInputs;
// Bit 0 = R1, Bit 1 = R2, ..., Bit 7 = R8
inline bool getRemote(uint8_t channel) {
    if (channel < 1 || channel > 8) return false;
    return (remoteInputs & (1 << (channel - 1))) != 0;
}

inline void setRemote(uint8_t channel, bool state) {
    if (channel < 1 || channel > 8) return;
    if (state) {
        remoteInputs |= (1 << (channel - 1));
    } else {
        remoteInputs &= ~(1 << (channel - 1));
    }
}
```

---

## Protocolo MQTT para Entradas Remotas

### 1. Tópico Individual por Canal Remoto
Permite pulsar ou alternar o estado de um canal individualmente:
* **Tópico:** `microlet/{deviceId}/cmd/R{channel}`
  * Exemplo: `microlet/esp32-01/cmd/R1`
* **Payloads aceitos:**
  * Ativar ($R_x = 1$): `"1"`, `"true"`, `"ON"`
  * Desativar ($R_x = 0$): `"0"`, `"false"`, `"OFF"`

### 2. Tópico JSON Agrupado
Permite atualizar múltiplos canais remotos atomicamente em um único pacote MQTT:
* **Tópico:** `microlet/{deviceId}/cmd/remotes`
* **Payload JSON:**
  ```json
  {
    "R1": 1,
    "R2": 0,
    "R3": 1
  }
  ```

### 3. Modo de Acionamento: Pulso vs. Retenção
* **Pulso Momentâneo (Pushbutton):** O cliente envia `"1"` e após um intervalo programável (ex: 200ms) envia `"0"`. Ideal para transições de avanço de etapa tipo botoeira de partida.
* **Chave com Retenção (Toggle Switch):** O cliente envia `"1"` com a flag `retain: true` no broker MQTT para que novos nós inicializem cientes da condição remota ligada.

---

## Endpoint HTTP / REST (Alternativa ao MQTT)

Para redes locais sem broker MQTT, o ESP32 também pode expor a rota:
* **Método:** `POST /api/remote`
* **Headers:** `Content-Type: application/json`
* **Corpo:**
  ```json
  {
    "channel": 1,
    "state": true
  }
  ```
* **Resposta:**
  ```json
  {
    "status": "ok",
    "channel": 1,
    "state": true,
    "timestamp": 12345678
  }
  ```

---

## Exemplo de Aplicação Prática no Projeto

Considerando a BES do sistema:
```text
lines:
  SM1=!M128+M4*M5*I1,
  SM2=M1*R1,
  SM3=M1*R1,
  SM4=M2*R1,
  SM5=M3*R2,
  RM1=M1*R1,
  RM2=M2*R1,
  RM3=M3*R2,
  RM4=M4*M5*I1,
  RM5=M4*M5*I1,
  XQ1=M2+M5,
  XQ2=M3+M4,
  SM128=1;
```

1. **Abertura do Processo Remoto:**
   - Mensagem MQTT em `microlet/01/cmd/R1` com payload `"1"`:
     - Dispara a transição de abertura (Divergência em E a partir da Etapa 1).
     - Etapa 1 é resetada (`RM1`), Etapas 2 e 3 são ativadas (`SM2`, `SM3`).
     - Saídas $Q_1$ e $Q_2$ são acionadas em paralelo.
2. **Avanço do Ramal Direito:**
   - Mensagem MQTT em `microlet/01/cmd/R2` com payload `"1"`:
     - Etapa 3 evolui para Etapa 5 (`SM5=M3*R2`, `RM3=M3*R2`).
3. **Avanço do Ramal Esquerdo:**
   - Mensagem MQTT em `microlet/01/cmd/R1` com payload `"1"`:
     - Etapa 2 evolui para Etapa 4 (`SM4=M2*R1`, `RM2=M2*R1`).
4. **Fechamento e Retorno Físico:**
   - Acionamento do fim-de-curso ou botão elétrico $I_1$ (Entrada física):
     - Sincronização e convergência em E das etapas 4 e 5 retornando à etapa inicial 1.
