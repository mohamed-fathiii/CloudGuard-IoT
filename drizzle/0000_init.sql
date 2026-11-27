CREATE TABLE "audit_log" (
	"audit_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" varchar(20) NOT NULL,
	"actor_id" varchar(100) NOT NULL,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50),
	"entity_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_audit_log_actor_type" CHECK ("audit_log"."actor_type" IN ('USER', 'SYSTEM', 'DEVICE', 'SERVICE')),
	CONSTRAINT "ck_audit_log_entity_type" CHECK ("audit_log"."entity_type" IS NULL OR "audit_log"."entity_type" IN ('DEVICE', 'CLOUD_RESOURCE', 'SECURITY_EVENT', 'RISK_ASSESSMENT', 'INCIDENT', 'INCIDENT_EVENT', 'RESPONSE_ACTION', 'AUDIT_LOG', 'OTHER')),
	CONSTRAINT "ck_audit_log_details_object" CHECK (jsonb_typeof("audit_log"."details") = 'object')
);
--> statement-breakpoint
CREATE TABLE "cloud_resource" (
	"resource_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_name" varchar(150) NOT NULL,
	"resource_type" varchar(50) NOT NULL,
	"provider" varchar(20) DEFAULT 'AWS' NOT NULL,
	"provider_resource_id" varchar(255) NOT NULL,
	"region" varchar(50) NOT NULL,
	"environment" varchar(20) DEFAULT 'SIMULATION' NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"tags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_scanned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_cloud_resource_type" CHECK ("cloud_resource"."resource_type" IN ('EC2', 'S3', 'IAM', 'LAMBDA', 'RDS', 'VPC', 'CLOUDFRONT', 'OTHER')),
	CONSTRAINT "ck_cloud_resource_provider" CHECK ("cloud_resource"."provider" IN ('AWS')),
	CONSTRAINT "ck_cloud_resource_environment" CHECK ("cloud_resource"."environment" IN ('DEVELOPMENT', 'TESTING', 'STAGING', 'PRODUCTION', 'SIMULATION')),
	CONSTRAINT "ck_cloud_resource_status" CHECK ("cloud_resource"."status" IN ('ACTIVE', 'INACTIVE', 'TERMINATED', 'ERROR')),
	CONSTRAINT "ck_cloud_resource_tags_object" CHECK (jsonb_typeof("cloud_resource"."tags") = 'object')
);
--> statement-breakpoint
CREATE TABLE "device" (
	"device_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_name" varchar(100) NOT NULL,
	"device_type" varchar(30) NOT NULL,
	"manufacturer" varchar(100),
	"model" varchar(100),
	"ip_address" "inet",
	"mac_address" "macaddr",
	"firmware_version" varchar(50),
	"location" varchar(150),
	"status" varchar(20) DEFAULT 'OFFLINE' NOT NULL,
	"environment" varchar(20) DEFAULT 'SIMULATION' NOT NULL,
	"is_simulated" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_device_type" CHECK ("device"."device_type" IN ('SENSOR', 'CAMERA', 'GATEWAY', 'ACTUATOR', 'SMART_LOCK', 'OTHER')),
	CONSTRAINT "ck_device_status" CHECK ("device"."status" IN ('ONLINE', 'OFFLINE', 'COMPROMISED', 'MAINTENANCE', 'DECOMMISSIONED')),
	CONSTRAINT "ck_device_environment" CHECK ("device"."environment" IN ('DEVELOPMENT', 'TESTING', 'STAGING', 'PRODUCTION', 'SIMULATION'))
);
--> statement-breakpoint
CREATE TABLE "incident" (
	"incident_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"severity" varchar(10) NOT NULL,
	"status" varchar(20) DEFAULT 'OPEN' NOT NULL,
	"risk_score" smallint DEFAULT 0 NOT NULL,
	"assigned_to" varchar(100),
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_incident_severity" CHECK ("incident"."severity" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
	CONSTRAINT "ck_incident_status" CHECK ("incident"."status" IN ('OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'CLOSED', 'FALSE_POSITIVE')),
	CONSTRAINT "ck_incident_risk_score" CHECK ("incident"."risk_score" BETWEEN 0 AND 100),
	CONSTRAINT "ck_incident_closed_at_valid" CHECK ("incident"."closed_at" IS NULL OR "incident"."closed_at" >= "incident"."opened_at"),
	CONSTRAINT "ck_incident_closure_consistency" CHECK ((
        ("incident"."status" IN ('RESOLVED','CLOSED','FALSE_POSITIVE') AND "incident"."closed_at" IS NOT NULL) OR
        ("incident"."status" NOT IN ('RESOLVED','CLOSED','FALSE_POSITIVE') AND "incident"."closed_at" IS NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "incident_event" (
	"incident_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"correlation_reason" text,
	"linked_by" varchar(100),
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_incident_event" PRIMARY KEY("incident_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "response_action" (
	"action_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"action_type" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"is_automated" boolean DEFAULT false NOT NULL,
	"performed_by" varchar(100),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_response_action_type" CHECK ("response_action"."action_type" IN ('ISOLATE_DEVICE', 'BLOCK_IP', 'TERMINATE_RESOURCE', 'REVOKE_CREDENTIALS', 'QUARANTINE_FILE', 'NOTIFY_ADMIN', 'RESTART_DEVICE', 'PATCH_FIRMWARE', 'OTHER')),
	CONSTRAINT "ck_response_action_status" CHECK ("response_action"."status" IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED')),
	CONSTRAINT "ck_response_action_times" CHECK ("response_action"."completed_at" IS NULL OR "response_action"."started_at" IS NULL OR "response_action"."completed_at" >= "response_action"."started_at")
);
--> statement-breakpoint
CREATE TABLE "risk_assessment" (
	"assessment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"risk_score" smallint NOT NULL,
	"risk_level" varchar(10) NOT NULL,
	"confidence_score" numeric(5, 2),
	"scoring_model_version" varchar(20) DEFAULT 'v1.0' NOT NULL,
	"explanation" text NOT NULL,
	"factors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_risk_assessment_score" CHECK ("risk_assessment"."risk_score" BETWEEN 0 AND 100),
	CONSTRAINT "ck_risk_assessment_confidence" CHECK ("risk_assessment"."confidence_score" IS NULL OR "risk_assessment"."confidence_score" BETWEEN 0 AND 100),
	CONSTRAINT "ck_risk_assessment_level" CHECK ("risk_assessment"."risk_level" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
	CONSTRAINT "ck_risk_assessment_level_matches_score" CHECK ((
        ("risk_assessment"."risk_score" BETWEEN 0  AND 24  AND "risk_assessment"."risk_level" = 'LOW') OR
        ("risk_assessment"."risk_score" BETWEEN 25 AND 49  AND "risk_assessment"."risk_level" = 'MEDIUM') OR
        ("risk_assessment"."risk_score" BETWEEN 50 AND 74  AND "risk_assessment"."risk_level" = 'HIGH') OR
        ("risk_assessment"."risk_score" BETWEEN 75 AND 100 AND "risk_assessment"."risk_level" = 'CRITICAL')
      )),
	CONSTRAINT "ck_risk_assessment_factors_object" CHECK (jsonb_typeof("risk_assessment"."factors") = 'object')
);
--> statement-breakpoint
CREATE TABLE "security_event" (
	"event_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" varchar(20) NOT NULL,
	"device_id" uuid,
	"resource_id" uuid,
	"event_type" varchar(60) NOT NULL,
	"severity" varchar(10) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"source_ip" "inet",
	"destination_ip" "inet",
	"raw_payload" jsonb,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_security_event_source_type" CHECK ("security_event"."source_type" IN ('IOT_DEVICE', 'CLOUD_RESOURCE', 'SYSTEM')),
	CONSTRAINT "ck_security_event_type" CHECK ("security_event"."event_type" IN ('UNAUTHORIZED_ACCESS', 'FAILED_LOGIN', 'MALWARE_DETECTED', 'ANOMALOUS_TRAFFIC', 'PORT_SCAN', 'PRIVILEGE_ESCALATION', 'CONFIGURATION_CHANGE', 'DATA_EXFILTRATION', 'FIRMWARE_TAMPERING', 'OTHER')),
	CONSTRAINT "ck_security_event_severity" CHECK ("security_event"."severity" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
	CONSTRAINT "ck_security_event_source_link" CHECK ((
        ("security_event"."source_type" = 'IOT_DEVICE'     AND "security_event"."device_id" IS NOT NULL AND "security_event"."resource_id" IS NULL) OR
        ("security_event"."source_type" = 'CLOUD_RESOURCE' AND "security_event"."resource_id" IS NOT NULL AND "security_event"."device_id" IS NULL) OR
        ("security_event"."source_type" = 'SYSTEM'         AND "security_event"."device_id" IS NULL AND "security_event"."resource_id" IS NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "incident_event" ADD CONSTRAINT "incident_event_incident_id_incident_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("incident_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "incident_event" ADD CONSTRAINT "incident_event_event_id_security_event_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."security_event"("event_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "response_action" ADD CONSTRAINT "response_action_incident_id_incident_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("incident_id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "risk_assessment" ADD CONSTRAINT "risk_assessment_event_id_security_event_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."security_event"("event_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "security_event" ADD CONSTRAINT "security_event_device_id_device_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device"("device_id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "security_event" ADD CONSTRAINT "security_event_resource_id_cloud_resource_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."cloud_resource"("resource_id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "idx_audit_log_actor" ON "audit_log" USING btree ("actor_type","actor_id");--> statement-breakpoint
CREATE INDEX "idx_audit_log_entity" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_log_created_at" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cloud_resource_provider_id" ON "cloud_resource" USING btree ("provider_resource_id");--> statement-breakpoint
CREATE INDEX "idx_cloud_resource_type" ON "cloud_resource" USING btree ("resource_type");--> statement-breakpoint
CREATE INDEX "idx_cloud_resource_region" ON "cloud_resource" USING btree ("region");--> statement-breakpoint
CREATE INDEX "idx_cloud_resource_status" ON "cloud_resource" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_cloud_resource_environment" ON "cloud_resource" USING btree ("environment");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_device_device_name" ON "device" USING btree ("device_name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_device_mac_address" ON "device" USING btree ("mac_address");--> statement-breakpoint
CREATE INDEX "idx_device_status" ON "device" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_device_environment" ON "device" USING btree ("environment");--> statement-breakpoint
CREATE INDEX "idx_device_type" ON "device" USING btree ("device_type");--> statement-breakpoint
CREATE INDEX "idx_device_last_seen_at" ON "device" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "idx_incident_status" ON "incident" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_incident_severity" ON "incident" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "idx_incident_opened_at" ON "incident" USING btree ("opened_at");--> statement-breakpoint
CREATE INDEX "idx_incident_assigned_to" ON "incident" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "idx_incident_event_event_id" ON "incident_event" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_response_action_incident_id" ON "response_action" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "idx_response_action_status" ON "response_action" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_response_action_type" ON "response_action" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "idx_risk_assessment_event_id" ON "risk_assessment" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_risk_assessment_level" ON "risk_assessment" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX "idx_risk_assessment_assessed_at" ON "risk_assessment" USING btree ("assessed_at");--> statement-breakpoint
CREATE INDEX "idx_security_event_device_id" ON "security_event" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "idx_security_event_resource_id" ON "security_event" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "idx_security_event_severity" ON "security_event" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "idx_security_event_type" ON "security_event" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_security_event_source_type" ON "security_event" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "idx_security_event_detected_at" ON "security_event" USING btree ("detected_at");