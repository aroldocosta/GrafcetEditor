# Firmware de Referência: ESP32 Grafcet Engine (`userver03` Receiver)

Este firmware de referência em C++ demonstra como um microcontrolador ESP32 recebe a configuração de Expressões Booleanas (`/code_param.cfg`) via requisição `HTTP POST` do **GrafcetEditor**, salvando o conteúdo no sistema de arquivos `LittleFS` e recarregando a engine sem necessidade de reboot.

## Endpoints HTTP Expostos no IoT:
* `POST /code_param.cfg`: Recebe o payload JSON gerado pelo `Userver03Generator`.
* `GET /status`: Retorna o status de execução das etapas `M1`, `M2`, etc.
