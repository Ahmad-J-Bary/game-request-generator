export interface Owner {
  id: number;
  name: string;
}

export interface CreateOwnerRequest {
  name: string;
}

export interface UpdateOwnerRequest {
  id: number;
  name?: string;
}
