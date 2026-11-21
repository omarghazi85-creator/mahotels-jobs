<?php
defined('ABSPATH') || exit;

/** Register a dedicated role without creating or changing any user. An existing
 * role with the same slug is never modified; inspect any collision before use. */
add_action('init', function () {
    if (!get_role('mah_jobs_service')) {
        add_role('mah_jobs_service', 'MAHotels Jobs Service', array(
            'read'=>true, 'mah_jobs_service'=>true,
        ));
    }
}, 1);
add_action('rest_api_init', function () {
    register_rest_route('mahotels-jobs/v1', '/service-drafts/slug-exists', array(
        'methods'=>'POST',
        'permission_callback'=>function () { return current_user_can('mah_jobs_service'); },
        'callback'=>function ($request) {
            $slug = $request->get_param('slug');
            if (!is_string($slug) || !preg_match('/^ma-jobs-[a-f0-9]{32}$/D', $slug)) {
                return new WP_Error('invalid_slug', 'Invalid slug.', array('status'=>400));
            }
            global $wpdb;
            $wpdb->last_error = '';
            $ids = get_posts(array('post_type'=>'ma_hotel_job', 'post_status'=>array('publish','draft','pending','private','future','trash'),
                'name'=>$slug, 'posts_per_page'=>1, 'fields'=>'ids', 'no_found_rows'=>true, 'suppress_filters'=>true, 'cache_results'=>false));
            // WordPress can append this suffix to the post_name on trashing.
            if (!$ids && $wpdb->last_error === '') {
                $ids = get_posts(array('post_type'=>'ma_hotel_job', 'post_status'=>'trash', 'name'=>$slug . '__trashed',
                    'posts_per_page'=>1, 'fields'=>'ids', 'no_found_rows'=>true, 'suppress_filters'=>true, 'cache_results'=>false));
            }
            if ($wpdb->last_error !== '') { return new WP_Error('lookup_failed', 'Slug lookup unavailable.', array('status'=>503)); }
            return rest_ensure_response(array('exists'=>!empty($ids)));
        },
    ));
    register_rest_route('mahotels-jobs/v1', '/service-drafts/(?P<id>\d+)', array(
        'methods'=>'GET',
        'permission_callback'=>function ($request) {
            $id = (int)$request['id'];
            return current_user_can('mah_jobs_service') && get_post_type($id) === 'ma_hotel_job' &&
                get_post_status($id) === 'draft' && (int)get_post_field('post_author',$id) === get_current_user_id();
        },
        'callback'=>function ($request) {
            $id=(int)$request['id'];
            $terms=wp_get_post_terms($id, 'ma_job_country', array('fields'=>'ids'));
            if (is_wp_error($terms)) { return new WP_Error('read_failed','Draft lookup unavailable.',array('status'=>503)); }
            return rest_ensure_response(array('id'=>$id, 'status'=>'draft', 'slug'=>get_post_field('post_name',$id),
                'title'=>get_post_field('post_title',$id), 'content'=>get_post_field('post_content',$id),
                'country_ids'=>array_map('intval',$terms)));
        },
    ));
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
