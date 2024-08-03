export type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[]

export type Database = {
	graphql_public: {
		Tables: {
			[_ in never]: never
		}
		Views: {
			[_ in never]: never
		}
		Functions: {
			graphql: {
				Args: {
					operationName?: string
					query?: string
					variables?: Json
					extensions?: Json
				}
				Returns: Json
			}
		}
		Enums: {
			[_ in never]: never
		}
		CompositeTypes: {
			[_ in never]: never
		}
	}
	public: {
		Tables: {
			crates: {
				Row: {
					created_at: string | null
					id: string
					name: string
					records: string[]
					updated_at: string | null
					user_id: string
				}
				Insert: {
					created_at?: string | null
					id?: string
					name: string
					records?: string[]
					updated_at?: string | null
					user_id: string
				}
				Update: {
					created_at?: string | null
					id?: string
					name?: string
					records?: string[]
					updated_at?: string | null
					user_id?: string
				}
				Relationships: [
					{
						foreignKeyName: 'crates_user_id_fkey'
						columns: ['user_id']
						isOneToOne: false
						referencedRelation: 'users'
						referencedColumns: ['id']
					}
				]
			}
			profiles: {
				Row: {
					discogs_token: string | null
					discogs_token_secret: string | null
					discogs_username: string | null
					id: string
					key_format: string
					list_layout: string
					name: string
					selected_crate: string
					turntable_pitch_range: number
					turntable_theme: string
					ui_theme: string
				}
				Insert: {
					discogs_token?: string | null
					discogs_token_secret?: string | null
					discogs_username?: string | null
					id: string
					key_format?: string
					list_layout?: string
					name: string
					selected_crate?: string
					turntable_pitch_range?: number
					turntable_theme?: string
					ui_theme?: string
				}
				Update: {
					discogs_token?: string | null
					discogs_token_secret?: string | null
					discogs_username?: string | null
					id?: string
					key_format?: string
					list_layout?: string
					name?: string
					selected_crate?: string
					turntable_pitch_range?: number
					turntable_theme?: string
					ui_theme?: string
				}
				Relationships: [
					{
						foreignKeyName: 'profiles_id_fkey'
						columns: ['id']
						isOneToOne: true
						referencedRelation: 'users'
						referencedColumns: ['id']
					}
				]
			}
			records: {
				Row: {
					artists: string
					catno: string | null
					cover: string | null
					created_at: string | null
					discogs_id: number | null
					id: string
					label: string | null
					spotify_id: string | null
					title: string
					updated_at: string | null
					user_id: string
					year: number | null
				}
				Insert: {
					artists: string
					catno?: string | null
					cover?: string | null
					created_at?: string | null
					discogs_id?: number | null
					id?: string
					label?: string | null
					spotify_id?: string | null
					title: string
					updated_at?: string | null
					user_id: string
					year?: number | null
				}
				Update: {
					artists?: string
					catno?: string | null
					cover?: string | null
					created_at?: string | null
					discogs_id?: number | null
					id?: string
					label?: string | null
					spotify_id?: string | null
					title?: string
					updated_at?: string | null
					user_id?: string
					year?: number | null
				}
				Relationships: [
					{
						foreignKeyName: 'records_user_id_fkey'
						columns: ['user_id']
						isOneToOne: false
						referencedRelation: 'users'
						referencedColumns: ['id']
					}
				]
			}
			tracks: {
				Row: {
					artists: string | null
					bpm: number | null
					created_at: string | null
					duration: number | null
					genre: string | null
					id: string
					key_value: number | null
					mode: number | null
					playable: boolean | null
					position: string | null
					record_id: string
					rpm: number | null
					sp_af_acousticness: number | null
					sp_af_danceability: number | null
					sp_af_duration_ms: number | null
					sp_af_energy: number | null
					sp_af_instrumentalness: number | null
					sp_af_key: number | null
					sp_af_liveness: number | null
					sp_af_loudness: number | null
					sp_af_mode: number | null
					sp_af_speechiness: number | null
					sp_af_tempo: number | null
					sp_af_time_signature: number | null
					sp_af_valence: number | null
					spotify_id: string | null
					time_signature_lower: number | null
					time_signature_upper: number | null
					title: string
					updated_at: string | null
				}
				Insert: {
					artists?: string | null
					bpm?: number | null
					created_at?: string | null
					duration?: number | null
					genre?: string | null
					id?: string
					key_value?: number | null
					mode?: number | null
					playable?: boolean | null
					position?: string | null
					record_id: string
					rpm?: number | null
					sp_af_acousticness?: number | null
					sp_af_danceability?: number | null
					sp_af_duration_ms?: number | null
					sp_af_energy?: number | null
					sp_af_instrumentalness?: number | null
					sp_af_key?: number | null
					sp_af_liveness?: number | null
					sp_af_loudness?: number | null
					sp_af_mode?: number | null
					sp_af_speechiness?: number | null
					sp_af_tempo?: number | null
					sp_af_time_signature?: number | null
					sp_af_valence?: number | null
					spotify_id?: string | null
					time_signature_lower?: number | null
					time_signature_upper?: number | null
					title: string
					updated_at?: string | null
				}
				Update: {
					artists?: string | null
					bpm?: number | null
					created_at?: string | null
					duration?: number | null
					genre?: string | null
					id?: string
					key_value?: number | null
					mode?: number | null
					playable?: boolean | null
					position?: string | null
					record_id?: string
					rpm?: number | null
					sp_af_acousticness?: number | null
					sp_af_danceability?: number | null
					sp_af_duration_ms?: number | null
					sp_af_energy?: number | null
					sp_af_instrumentalness?: number | null
					sp_af_key?: number | null
					sp_af_liveness?: number | null
					sp_af_loudness?: number | null
					sp_af_mode?: number | null
					sp_af_speechiness?: number | null
					sp_af_tempo?: number | null
					sp_af_time_signature?: number | null
					sp_af_valence?: number | null
					spotify_id?: string | null
					time_signature_lower?: number | null
					time_signature_upper?: number | null
					title?: string
					updated_at?: string | null
				}
				Relationships: [
					{
						foreignKeyName: 'tracks_record_id_fkey'
						columns: ['record_id']
						isOneToOne: false
						referencedRelation: 'records'
						referencedColumns: ['id']
					}
				]
			}
		}
		Views: {
			[_ in never]: never
		}
		Functions: {
			[_ in never]: never
		}
		Enums: {
			[_ in never]: never
		}
		CompositeTypes: {
			[_ in never]: never
		}
	}
	storage: {
		Tables: {
			buckets: {
				Row: {
					allowed_mime_types: string[] | null
					avif_autodetection: boolean | null
					created_at: string | null
					file_size_limit: number | null
					id: string
					name: string
					owner: string | null
					owner_id: string | null
					public: boolean | null
					updated_at: string | null
				}
				Insert: {
					allowed_mime_types?: string[] | null
					avif_autodetection?: boolean | null
					created_at?: string | null
					file_size_limit?: number | null
					id: string
					name: string
					owner?: string | null
					owner_id?: string | null
					public?: boolean | null
					updated_at?: string | null
				}
				Update: {
					allowed_mime_types?: string[] | null
					avif_autodetection?: boolean | null
					created_at?: string | null
					file_size_limit?: number | null
					id?: string
					name?: string
					owner?: string | null
					owner_id?: string | null
					public?: boolean | null
					updated_at?: string | null
				}
				Relationships: []
			}
			migrations: {
				Row: {
					executed_at: string | null
					hash: string
					id: number
					name: string
				}
				Insert: {
					executed_at?: string | null
					hash: string
					id: number
					name: string
				}
				Update: {
					executed_at?: string | null
					hash?: string
					id?: number
					name?: string
				}
				Relationships: []
			}
			objects: {
				Row: {
					bucket_id: string | null
					created_at: string | null
					id: string
					last_accessed_at: string | null
					metadata: Json | null
					name: string | null
					owner: string | null
					owner_id: string | null
					path_tokens: string[] | null
					updated_at: string | null
					version: string | null
				}
				Insert: {
					bucket_id?: string | null
					created_at?: string | null
					id?: string
					last_accessed_at?: string | null
					metadata?: Json | null
					name?: string | null
					owner?: string | null
					owner_id?: string | null
					path_tokens?: string[] | null
					updated_at?: string | null
					version?: string | null
				}
				Update: {
					bucket_id?: string | null
					created_at?: string | null
					id?: string
					last_accessed_at?: string | null
					metadata?: Json | null
					name?: string | null
					owner?: string | null
					owner_id?: string | null
					path_tokens?: string[] | null
					updated_at?: string | null
					version?: string | null
				}
				Relationships: [
					{
						foreignKeyName: 'objects_bucketId_fkey'
						columns: ['bucket_id']
						isOneToOne: false
						referencedRelation: 'buckets'
						referencedColumns: ['id']
					}
				]
			}
			s3_multipart_uploads: {
				Row: {
					bucket_id: string
					created_at: string
					id: string
					in_progress_size: number
					key: string
					owner_id: string | null
					upload_signature: string
					version: string
				}
				Insert: {
					bucket_id: string
					created_at?: string
					id: string
					in_progress_size?: number
					key: string
					owner_id?: string | null
					upload_signature: string
					version: string
				}
				Update: {
					bucket_id?: string
					created_at?: string
					id?: string
					in_progress_size?: number
					key?: string
					owner_id?: string | null
					upload_signature?: string
					version?: string
				}
				Relationships: [
					{
						foreignKeyName: 's3_multipart_uploads_bucket_id_fkey'
						columns: ['bucket_id']
						isOneToOne: false
						referencedRelation: 'buckets'
						referencedColumns: ['id']
					}
				]
			}
			s3_multipart_uploads_parts: {
				Row: {
					bucket_id: string
					created_at: string
					etag: string
					id: string
					key: string
					owner_id: string | null
					part_number: number
					size: number
					upload_id: string
					version: string
				}
				Insert: {
					bucket_id: string
					created_at?: string
					etag: string
					id?: string
					key: string
					owner_id?: string | null
					part_number: number
					size?: number
					upload_id: string
					version: string
				}
				Update: {
					bucket_id?: string
					created_at?: string
					etag?: string
					id?: string
					key?: string
					owner_id?: string | null
					part_number?: number
					size?: number
					upload_id?: string
					version?: string
				}
				Relationships: [
					{
						foreignKeyName: 's3_multipart_uploads_parts_bucket_id_fkey'
						columns: ['bucket_id']
						isOneToOne: false
						referencedRelation: 'buckets'
						referencedColumns: ['id']
					},
					{
						foreignKeyName: 's3_multipart_uploads_parts_upload_id_fkey'
						columns: ['upload_id']
						isOneToOne: false
						referencedRelation: 's3_multipart_uploads'
						referencedColumns: ['id']
					}
				]
			}
		}
		Views: {
			[_ in never]: never
		}
		Functions: {
			can_insert_object: {
				Args: {
					bucketid: string
					name: string
					owner: string
					metadata: Json
				}
				Returns: undefined
			}
			extension: {
				Args: {
					name: string
				}
				Returns: string
			}
			filename: {
				Args: {
					name: string
				}
				Returns: string
			}
			foldername: {
				Args: {
					name: string
				}
				Returns: string[]
			}
			get_size_by_bucket: {
				Args: Record<PropertyKey, never>
				Returns: {
					size: number
					bucket_id: string
				}[]
			}
			list_multipart_uploads_with_delimiter: {
				Args: {
					bucket_id: string
					prefix_param: string
					delimiter_param: string
					max_keys?: number
					next_key_token?: string
					next_upload_token?: string
				}
				Returns: {
					key: string
					id: string
					created_at: string
				}[]
			}
			list_objects_with_delimiter: {
				Args: {
					bucket_id: string
					prefix_param: string
					delimiter_param: string
					max_keys?: number
					start_after?: string
					next_token?: string
				}
				Returns: {
					name: string
					id: string
					metadata: Json
					updated_at: string
				}[]
			}
			operation: {
				Args: Record<PropertyKey, never>
				Returns: string
			}
			search: {
				Args: {
					prefix: string
					bucketname: string
					limits?: number
					levels?: number
					offsets?: number
					search?: string
					sortcolumn?: string
					sortorder?: string
				}
				Returns: {
					name: string
					id: string
					updated_at: string
					created_at: string
					last_accessed_at: string
					metadata: Json
				}[]
			}
		}
		Enums: {
			[_ in never]: never
		}
		CompositeTypes: {
			[_ in never]: never
		}
	}
}

type PublicSchema = Database[Extract<keyof Database, 'public'>]

export type Tables<
	PublicTableNameOrOptions extends
		| keyof (PublicSchema['Tables'] & PublicSchema['Views'])
		| { schema: keyof Database },
	TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
		? keyof (Database[PublicTableNameOrOptions['schema']]['Tables'] &
				Database[PublicTableNameOrOptions['schema']]['Views'])
		: never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
	? (Database[PublicTableNameOrOptions['schema']]['Tables'] &
			Database[PublicTableNameOrOptions['schema']]['Views'])[TableName] extends {
			Row: infer R
		}
		? R
		: never
	: PublicTableNameOrOptions extends keyof (PublicSchema['Tables'] &
				PublicSchema['Views'])
		? (PublicSchema['Tables'] &
				PublicSchema['Views'])[PublicTableNameOrOptions] extends {
				Row: infer R
			}
			? R
			: never
		: never

export type TablesInsert<
	PublicTableNameOrOptions extends
		| keyof PublicSchema['Tables']
		| { schema: keyof Database },
	TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
		? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
		: never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
	? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Insert: infer I
		}
		? I
		: never
	: PublicTableNameOrOptions extends keyof PublicSchema['Tables']
		? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
				Insert: infer I
			}
			? I
			: never
		: never

export type TablesUpdate<
	PublicTableNameOrOptions extends
		| keyof PublicSchema['Tables']
		| { schema: keyof Database },
	TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
		? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
		: never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
	? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Update: infer U
		}
		? U
		: never
	: PublicTableNameOrOptions extends keyof PublicSchema['Tables']
		? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
				Update: infer U
			}
			? U
			: never
		: never

export type Enums<
	PublicEnumNameOrOptions extends
		| keyof PublicSchema['Enums']
		| { schema: keyof Database },
	EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
		? keyof Database[PublicEnumNameOrOptions['schema']]['Enums']
		: never = never
> = PublicEnumNameOrOptions extends { schema: keyof Database }
	? Database[PublicEnumNameOrOptions['schema']]['Enums'][EnumName]
	: PublicEnumNameOrOptions extends keyof PublicSchema['Enums']
		? PublicSchema['Enums'][PublicEnumNameOrOptions]
		: never
