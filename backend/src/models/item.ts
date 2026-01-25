// Define item type and in-memory storage

export interface Item {
  id: number;
  name: string;
}

export let items: Item[] = [];