<?php
defined('ABSPATH') || exit;

/** Experimental: explicitly grant mah_jobs_service to a dedicated service user.
 * No role or user is created on activation. Do not grant ordinary post caps. */
add_action('rest_api_init', function () {
    register_rest_route('mahotels-jobs/v1', '/service-drafts', array(
        'methods' => 'POST',
        'permission_callback' => function () { return current_user_can('mah_jobs_service'); },
        'callback' => function ($request) {
            $params = $request->get_json_params();
            if (!is_array($params) || array_diff(array_keys($params), array('title','content','excerpt','slug','country_id'))) {
                return new WP_Error('invalid_fields', 'Unexpected fields.', array('status'=>400));
            }
            foreach (array('title','content','slug') as $key) {
                if (!isset($params[$key]) || !is_string($params[$key]) || trim($params[$key]) === '') {
                    return new WP_Error('invalid_fields', 'Required fields missing.', array('status'=>400));
                }
            }
            if (strlen($params['title']) > 500 || strlen($params['content']) > 100000 ||
                !preg_match('/^ma-jobs-[a-f0-9]{32}$/D', $params['slug']) ||
                (isset($params['excerpt']) && (!is_string($params['excerpt']) || strlen($params['excerpt']) > 10000))) {
                return new WP_Error('invalid_fields', 'Invalid draft fields.', array('status'=>400));
            }
            $term_id = $params['country_id'] ?? null;
            if (!is_int($term_id) || $term_id < 1 || !term_exists($term_id, 'ma_job_country')) {
                return new WP_Error('invalid_country', 'Valid country required.', array('status'=>400));
            }
            $title = sanitize_text_field($params['title']);
            $content = wp_kses_post($params['content']);
            if ($title === '' || trim(wp_strip_all_tags($content)) === '') {
                return new WP_Error('invalid_fields', 'Empty draft.', array('status'=>400));
            }
            // wp_insert_post runs as the service user; client-supplied status and
            // author are rejected above. No capability for core post writes is granted.
            $id = wp_insert_post(array('post_type'=>'ma_hotel_job', 'post_status'=>'draft',
                'post_author'=>get_current_user_id(), 'post_name'=>$params['slug'],
                'post_title'=>$title, 'post_content'=>$content,
                'post_excerpt'=>sanitize_text_field($params['excerpt'] ?? '')), true);
            if (is_wp_error($id)) { return new WP_Error('draft_failed', 'Draft creation failed.', array('status'=>503)); }
            $assigned = wp_set_object_terms($id, array($term_id), 'ma_job_country');
            if (is_wp_error($assigned) || get_post_status($id) !== 'draft' || get_post_field('post_name', $id) !== $params['slug']) {
                return new WP_Error('draft_review', 'Draft created; reconciliation required.', array('status'=>503, 'id'=>$id));
            }
            return new WP_REST_Response(array('id'=>$id, 'status'=>'draft', 'slug'=>$params['slug']), 201);
        },
    ));
});
