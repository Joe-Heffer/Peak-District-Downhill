export async function loadTreesData(url = `${import.meta.env.BASE_URL}data/terrain/cutgate-trees.json`) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load trees data (${response.status})`);
  }
  return response.json();
}
