# Sprites Estáticos de Ataque (PokéLimit)

Coloque seus arquivos `.png` de ataques não animados nesta pasta (`public/assets/attacks/`).

Em seguida, abra `src/config/pokemonManifest.ts` e adicione a propriedade `spriteFile` (e opcionalmente `spriteScale`) dentro do `attackProfile` do Pokémon desejado:

```ts
attackProfile: {
  name: 'Esfera Elétrica',
  // ...
  spriteFile: 'assets/attacks/meu_ataque.png',
  spriteScale: 1.0,
}
```
