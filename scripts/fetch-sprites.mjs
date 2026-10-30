import fs from 'node:fs/promises';
import path from 'node:path';

const POKEMON_LIST = [
  // Iniciais e suas Evoluções
  { id: '0025', name: 'Pikachu' },
  { id: '0026', name: 'Raichu' },
  { id: '0001', name: 'Bulbasaur' },
  { id: '0002', name: 'Ivysaur' },
  { id: '0003', name: 'Venusaur' },
  { id: '0004', name: 'Charmander' },
  { id: '0005', name: 'Charmeleon' },
  { id: '0006', name: 'Charizard' },
  { id: '0007', name: 'Squirtle' },
  { id: '0008', name: 'Wartortle' },
  { id: '0009', name: 'Blastoise' },
  { id: '0039', name: 'Jigglypuff' },
  { id: '0040', name: 'Wigglytuff' },
  // Inimigos e Boss
  { id: '0019', name: 'Rattata' },
  { id: '0041', name: 'Zubat' },
  { id: '0095', name: 'Onix' },
];

const BASE_URL = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite';
const OUTPUT_DIR = path.resolve('public/assets/sprites');

function parseAnimDataXml(xmlText) {
  const anims = {};
  const animBlocks = xmlText.match(/<Anim>[\s\S]*?<\/Anim>/g) || [];

  for (const block of animBlocks) {
    const nameMatch = block.match(/<Name>(.*?)<\/Name>/);
    if (!nameMatch) continue;
    const name = nameMatch[1];

    const copyOfMatch = block.match(/<CopyOf>(.*?)<\/CopyOf>/);
    if (copyOfMatch) {
      anims[name] = { copyOf: copyOfMatch[1] };
      continue;
    }

    const frameWidth = Number(block.match(/<FrameWidth>(\d+)<\/FrameWidth>/)?.[1] || 32);
    const frameHeight = Number(block.match(/<FrameHeight>(\d+)<\/FrameHeight>/)?.[1] || 32);
    const durationsMatch = block.match(/<Durations>([\s\S]*?)<\/Durations>/);
    const durations = durationsMatch
      ? [...durationsMatch[1].matchAll(/<Duration>(\d+)<\/Duration>/g)].map((m) => Number(m[1]))
      : [4];

    anims[name] = {
      frameWidth,
      frameHeight,
      frameCount: durations.length,
      durations,
    };
  }

  for (const [name, data] of Object.entries(anims)) {
    if (data.copyOf && anims[data.copyOf]) {
      anims[name] = { ...anims[data.copyOf] };
    }
  }

  return anims;
}

async function downloadPokemon(pokemon) {
  const pokeDir = path.join(OUTPUT_DIR, pokemon.id);
  await fs.mkdir(pokeDir, { recursive: true });

  const xmlUrl = `${BASE_URL}/${pokemon.id}/AnimData.xml`;
  console.log(`Baixando AnimData.xml de ${pokemon.name} (#${pokemon.id})...`);
  const xmlRes = await fetch(xmlUrl);
  if (!xmlRes.ok) {
    throw new Error(`Falha ao baixar ${xmlUrl}: ${xmlRes.status}`);
  }
  const xmlText = await xmlRes.text();
  await fs.writeFile(path.join(pokeDir, 'AnimData.xml'), xmlText, 'utf-8');

  const allAnims = parseAnimDataXml(xmlText);
  const desiredAnims = ['Walk', 'Idle', 'Attack', 'Strike', 'Shoot', 'Charge', 'Sing', 'Hop'];
  const downloadedAnims = {};

  for (const animName of desiredAnims) {
    if (!allAnims[animName]) continue;
    if (animName !== 'Walk' && animName !== 'Idle' && downloadedAnims['Attack']) {
      continue;
    }

    const fileName = `${animName}-Anim.png`;
    const imgUrl = `${BASE_URL}/${pokemon.id}/${fileName}`;
    const imgRes = await fetch(imgUrl);
    if (imgRes.ok) {
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      const targetKey = animName === 'Walk' || animName === 'Idle' ? animName : 'Attack';
      const savedFileName = `${targetKey}-Anim.png`;
      await fs.writeFile(path.join(pokeDir, savedFileName), buffer);
      downloadedAnims[targetKey] = {
        file: `assets/sprites/${pokemon.id}/${savedFileName}`,
        ...allAnims[animName],
      };
      console.log(`  ✓ ${savedFileName} (${allAnims[animName].frameWidth}x${allAnims[animName].frameHeight}, ${allAnims[animName].frameCount} frames/dir)`);
    }
  }

  return {
    id: pokemon.id,
    name: pokemon.name,
    anims: downloadedAnims,
  };
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const manifest = {};

  for (const pokemon of POKEMON_LIST) {
    manifest[pokemon.id] = await downloadPokemon(pokemon);
  }

  const manifestPath = path.join(OUTPUT_DIR, 'pokemon-manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\nManifesto salvo com sucesso em: ${manifestPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
